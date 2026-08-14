"""Inbound email → project/opportunity Notes (ProjectReport).

Primary path: Microsoft 365 shared mailbox + Power Automate HTTP JSON POST.
Multipart form (legacy/provider-style) is still accepted by the webhook.
"""
from __future__ import annotations

import html as html_lib
import io
import logging
import re
from dataclasses import dataclass, field
from email.utils import parseaddr
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import FileObject, Project, ProjectReport, User
from ..routes.files import canonical_key, get_storage, unique_upload_key
from ..storage.local_provider import LocalStorageProvider

logger = logging.getLogger(__name__)

MK_CODE_RE = re.compile(r"\bMK-(\d{5})\b", re.IGNORECASE)

# Align with Notes UI (images/PDF/Office) plus common mail attachments.
_ALLOWED_ATTACHMENT_EXT = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".txt",
    ".csv",
    ".zip",
}
_ALLOWED_ATTACHMENT_CT_PREFIXES = (
    "image/",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip",
)

RouteKind = str  # "notes" | "unrouted" | future: "monitoring"


@dataclass
class InboundAttachment:
    filename: str
    content_type: str
    content: bytes


@dataclass
class ParsedInboundEmail:
    from_raw: str
    from_email: str
    from_name: str
    to_raw: str
    cc_raw: str
    subject: str
    text_body: str
    html_body: str
    message_id: str
    envelope_to: list[str] = field(default_factory=list)
    attachments: list[InboundAttachment] = field(default_factory=list)


@dataclass
class InboundProcessResult:
    status: str  # created | duplicate | discarded_* | ignored_unrouted | error
    detail: str = ""
    report_id: Optional[str] = None
    project_id: Optional[str] = None
    project_code: Optional[str] = None
    mk_code: Optional[str] = None


def _csv_lower_set(raw: str) -> set[str]:
    return {p.strip().lower() for p in (raw or "").split(",") if p.strip()}


def notes_recipient_addresses() -> set[str]:
    return _csv_lower_set(settings.inbound_email_notes_addresses)


def allowed_sender_domains() -> set[str]:
    return _csv_lower_set(settings.inbound_email_allowed_domains)


def extract_email_address(raw: str) -> str:
    _, addr = parseaddr(raw or "")
    addr = (addr or "").strip().lower()
    if addr and "@" in addr:
        return addr
    # Fallback: first email-looking token
    m = re.search(r"[\w.+-]+@[\w.-]+\.\w+", raw or "", re.I)
    return (m.group(0).lower() if m else "").strip()


def extract_email_addresses_from_header(raw: str) -> list[str]:
    if not raw:
        return []
    found: list[str] = []
    for part in re.split(r"[,;]", raw):
        addr = extract_email_address(part)
        if addr and addr not in found:
            found.append(addr)
    return found


def sender_domain(email: str) -> str:
    if "@" not in (email or ""):
        return ""
    return email.rsplit("@", 1)[-1].lower().strip()


def is_allowed_sender(email: str, domains: Optional[set[str]] = None) -> bool:
    dom = sender_domain(email)
    allow = domains if domains is not None else allowed_sender_domains()
    return bool(dom) and dom in allow


def extract_mk_code(*texts: str) -> Optional[str]:
    """Return first MK-##### found (normalized uppercase), or None."""
    for text in texts:
        if not text:
            continue
        m = MK_CODE_RE.search(text)
        if m:
            return f"MK-{m.group(1)}"
    return None


def html_to_text(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", html)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p\s*>", "\n\n", text)
    text = re.sub(r"(?i)</div\s*>", "\n", text)
    text = re.sub(r"(?i)</tr\s*>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", "", text)
    text = html_lib.unescape(text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def resolve_body(text_body: str, html_body: str) -> str:
    plain = (text_body or "").strip()
    if plain:
        return plain
    return html_to_text(html_body or "")


def parse_message_id_from_headers(headers: str) -> str:
    if not headers:
        return ""
    m = re.search(r"(?im)^Message-I[Dd]\s*:\s*(.+)$", headers)
    if not m:
        return ""
    return m.group(1).strip().strip("<>").strip()


def route_kind_for_recipients(recipient_emails: list[str]) -> RouteKind:
    notes = notes_recipient_addresses()
    for addr in recipient_emails:
        if addr.lower() in notes:
            return "notes"
    return "unrouted"


def collect_recipient_emails(parsed: ParsedInboundEmail) -> list[str]:
    out: list[str] = []
    for src in (parsed.envelope_to, extract_email_addresses_from_header(parsed.to_raw), extract_email_addresses_from_header(parsed.cc_raw)):
        for addr in src:
            a = addr.lower().strip()
            if a and a not in out:
                out.append(a)
    return out


def attachment_allowed(filename: str, content_type: str) -> bool:
    name = (filename or "").lower()
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1]
    if ext in _ALLOWED_ATTACHMENT_EXT:
        return True
    ct = (content_type or "").lower().split(";")[0].strip()
    if not ct:
        return False
    return any(ct == p or ct.startswith(p.rstrip("/") + "/") or ct.startswith(p) for p in _ALLOWED_ATTACHMENT_CT_PREFIXES)


def find_user_by_email(db: Session, email: str) -> Optional[User]:
    email_l = (email or "").strip().lower()
    if not email_l:
        return None
    return (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            or_(
                func.lower(User.email_corporate) == email_l,
                func.lower(User.email_personal) == email_l,
            ),
        )
        .first()
    )


def find_projects_by_mk_code(db: Session, mk_code: str) -> list[Project]:
    """Match Project.code starting with MK-##### (full code is MK-#####/client-year)."""
    prefix = (mk_code or "").strip().upper()
    if not prefix:
        return []
    # Exact prefix before '/' or end; avoid MK-00497 matching MK-004970
    like = f"{prefix}%"
    rows = (
        db.query(Project)
        .filter(Project.deleted_at.is_(None), Project.code.ilike(like))
        .all()
    )
    out: list[Project] = []
    for p in rows:
        code = (p.code or "").upper()
        if code == prefix or code.startswith(prefix + "/"):
            out.append(p)
    return out


def _already_processed(db: Session, project_id: UUID, message_id: str) -> Optional[ProjectReport]:
    if not message_id:
        return None
    recent = (
        db.query(ProjectReport)
        .filter(ProjectReport.project_id == project_id)
        .order_by(ProjectReport.created_at.desc())
        .limit(100)
        .all()
    )
    for row in recent:
        images = row.images if isinstance(row.images, dict) else {}
        inbound = images.get("inbound_email") if isinstance(images, dict) else None
        if isinstance(inbound, dict) and (inbound.get("message_id") or "") == message_id:
            return row
    return None


def _store_attachment(
    db: Session,
    *,
    project: Project,
    filename: str,
    content_type: str,
    content: bytes,
    created_by: Optional[UUID],
) -> FileObject:
    storage = get_storage()
    key = unique_upload_key(
        canonical_key(
            project_code=project.code or "misc",
            slug=str(project.id)[:8],
            category="project-report",
            original_name=filename or "attachment",
        )
    )
    bio = io.BytesIO(content)
    bio.seek(0)
    storage.copy_in(bio, key)
    if isinstance(storage, LocalStorageProvider):
        provider, container = "local", "local"
    else:
        provider, container = "blob", settings.azure_blob_container or ""
    fo = FileObject(
        provider=provider,
        container=container,
        key=key,
        size_bytes=len(content),
        checksum_sha256="na",
        content_type=content_type or "application/octet-stream",
        project_id=project.id,
        created_by=created_by,
        source_ref="inbound_email",
        tags={"original_name": filename or "attachment"},
    )
    db.add(fo)
    db.flush()
    return fo


def build_note_description(*, from_email: str, from_name: str, subject: str, body: str) -> str:
    who = from_name.strip() if from_name.strip() else from_email
    header_lines = [
        f"From: {who} <{from_email}>" if from_email else f"From: {who}",
        f"Subject: {subject}" if subject else None,
        "",
        body or "(empty message body)",
    ]
    return "\n".join(line for line in header_lines if line is not None)


def process_inbound_email(db: Session, parsed: ParsedInboundEmail) -> InboundProcessResult:
    recipients = collect_recipient_emails(parsed)
    kind = route_kind_for_recipients(recipients)
    if kind == "unrouted":
        logger.info(
            "inbound_email_ignored_unrouted",
            extra={"recipients": recipients, "subject": parsed.subject[:120]},
        )
        return InboundProcessResult(status="ignored_unrouted", detail="No matching inbound address")

    if kind != "notes":
        # Future handlers (e.g. monitoring) plug in here.
        return InboundProcessResult(status="ignored_unrouted", detail=f"Unhandled route: {kind}")

    return _process_project_notes(db, parsed)


def _process_project_notes(db: Session, parsed: ParsedInboundEmail) -> InboundProcessResult:
    from_email = (parsed.from_email or extract_email_address(parsed.from_raw) or "").lower()
    if not is_allowed_sender(from_email):
        logger.info(
            "inbound_email_discarded_bad_domain",
            extra={"from": from_email, "subject": (parsed.subject or "")[:120]},
        )
        return InboundProcessResult(status="discarded_bad_domain", detail=f"Sender not allowed: {from_email}")

    body = resolve_body(parsed.text_body, parsed.html_body)
    mk_code = extract_mk_code(parsed.subject, body[:4000])
    if not mk_code:
        logger.info(
            "inbound_email_discarded_no_code",
            extra={"from": from_email, "subject": (parsed.subject or "")[:120]},
        )
        return InboundProcessResult(status="discarded_no_code", detail="No MK-##### in subject/body")

    projects = find_projects_by_mk_code(db, mk_code)
    if not projects:
        logger.info(
            "inbound_email_discarded_project_not_found",
            extra={"mk_code": mk_code, "from": from_email},
        )
        return InboundProcessResult(
            status="discarded_project_not_found",
            detail=f"No project for {mk_code}",
            mk_code=mk_code,
        )
    if len(projects) > 1:
        logger.warning(
            "inbound_email_discarded_ambiguous_code",
            extra={"mk_code": mk_code, "count": len(projects), "from": from_email},
        )
        return InboundProcessResult(
            status="discarded_ambiguous_code",
            detail=f"Multiple projects match {mk_code}",
            mk_code=mk_code,
        )

    project = projects[0]
    message_id = (parsed.message_id or "").strip()
    if message_id:
        existing = _already_processed(db, project.id, message_id)
        if existing:
            return InboundProcessResult(
                status="duplicate",
                detail="Already processed",
                report_id=str(existing.id),
                project_id=str(project.id),
                project_code=project.code,
                mk_code=mk_code,
            )

    user = find_user_by_email(db, from_email)
    created_by = user.id if user else None

    max_n = max(0, int(settings.inbound_email_max_attachments or 10))
    max_bytes = max(1, int(settings.inbound_email_max_attachment_mb or 20)) * 1024 * 1024
    attachment_meta: list[dict[str, Any]] = []
    for att in parsed.attachments[:max_n]:
        if len(att.content) > max_bytes:
            logger.info(
                "inbound_email_attachment_skipped_size",
                extra={"filename": att.filename, "size": len(att.content)},
            )
            continue
        if not attachment_allowed(att.filename, att.content_type):
            logger.info(
                "inbound_email_attachment_skipped_type",
                extra={"filename": att.filename, "content_type": att.content_type},
            )
            continue
        try:
            fo = _store_attachment(
                db,
                project=project,
                filename=att.filename or "attachment",
                content_type=att.content_type or "application/octet-stream",
                content=att.content,
                created_by=created_by,
            )
            attachment_meta.append(
                {
                    "file_object_id": str(fo.id),
                    "original_name": att.filename or "attachment",
                    "content_type": att.content_type or "application/octet-stream",
                }
            )
        except Exception:
            logger.exception("inbound_email_attachment_store_failed", extra={"filename": att.filename})

    subject = (parsed.subject or "").strip() or f"Email {mk_code}"
    title = subject[:255]
    description = build_note_description(
        from_email=from_email,
        from_name=parsed.from_name or "",
        subject=subject,
        body=body,
    )

    images: dict[str, Any] = {
        "inbound_email": {
            "message_id": message_id or None,
            "from_email": from_email,
            "from_name": parsed.from_name or None,
            "subject": subject,
        },
    }
    if attachment_meta:
        images["attachments"] = attachment_meta

    category_id = (settings.inbound_email_notes_category_id or "client-communication-log").strip() or "general"

    row = ProjectReport(
        project_id=project.id,
        title=title,
        category_id=category_id,
        description=description,
        images=images,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    try:
        from .audit import create_audit_log

        create_audit_log(
            db=db,
            entity_type="report",
            entity_id=str(row.id),
            action="CREATE",
            actor_id=str(created_by) if created_by else None,
            actor_role="inbound_email",
            source="inbound_email",
            changes_json={"title": title, "category_id": category_id, "mk_code": mk_code},
            context={"project_id": str(project.id), "from_email": from_email},
        )
    except Exception:
        pass

    logger.info(
        "inbound_email_note_created",
        extra={
            "report_id": str(row.id),
            "project_id": str(project.id),
            "project_code": project.code,
            "mk_code": mk_code,
            "from": from_email,
            "attachments": len(attachment_meta),
        },
    )
    return InboundProcessResult(
        status="created",
        detail="Note created",
        report_id=str(row.id),
        project_id=str(project.id),
        project_code=project.code,
        mk_code=mk_code,
    )


def parse_sendgrid_inbound_form(
    form: dict[str, Any],
    files: list[tuple[str, str, str, bytes]],
) -> ParsedInboundEmail:
    """Build ParsedInboundEmail from multipart/form fields + uploaded files."""
    return _parse_inbound_dict(form, files=files)


def parse_office365_json(payload: dict[str, Any]) -> ParsedInboundEmail:
    """Build ParsedInboundEmail from Power Automate / Microsoft 365 HTTP JSON body.

    Expected fields (all optional except enough to route + identify project):
      from, to, cc, subject, text, html, body, message_id / internet_message_id,
      attachments: [{ filename, content_type, content_base64 }]
    """
    return _parse_inbound_dict(payload, files=[])


def _decode_json_attachments(payload: dict[str, Any]) -> list[InboundAttachment]:
    import base64

    raw = payload.get("attachments")
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            import json

            raw = json.loads(raw)
        except Exception:
            return []
    if not isinstance(raw, list):
        return []

    out: list[InboundAttachment] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or item.get("name") or item.get("Name") or "attachment")
        content_type = str(
            item.get("content_type")
            or item.get("contentType")
            or item.get("ContentType")
            or "application/octet-stream"
        )
        b64 = item.get("content_base64") or item.get("contentBytes") or item.get("ContentBytes") or item.get("content")
        if b64 is None:
            continue
        if isinstance(b64, bytes):
            content = b64
        else:
            try:
                content = base64.b64decode(str(b64), validate=False)
            except Exception:
                continue
        if not content:
            continue
        out.append(InboundAttachment(filename=filename, content_type=content_type, content=content))
    return out


def _parse_inbound_dict(
    form: dict[str, Any],
    *,
    files: list[tuple[str, str, str, bytes]],
) -> ParsedInboundEmail:
    from_raw = str(form.get("from") or form.get("From") or "")
    to_raw = str(form.get("to") or form.get("To") or form.get("toRecipients") or "")
    if isinstance(form.get("toRecipients"), list):
        # Graph-style list of {emailAddress: {address}}
        parts: list[str] = []
        for item in form["toRecipients"]:
            if isinstance(item, dict):
                ea = item.get("emailAddress") or item.get("EmailAddress") or item
                if isinstance(ea, dict):
                    parts.append(str(ea.get("address") or ea.get("Address") or ""))
                else:
                    parts.append(str(item))
            else:
                parts.append(str(item))
        to_raw = ", ".join(p for p in parts if p)
    cc_raw = str(form.get("cc") or form.get("Cc") or form.get("ccRecipients") or "")
    if isinstance(form.get("ccRecipients"), list):
        parts = []
        for item in form["ccRecipients"]:
            if isinstance(item, dict):
                ea = item.get("emailAddress") or item.get("EmailAddress") or item
                if isinstance(ea, dict):
                    parts.append(str(ea.get("address") or ea.get("Address") or ""))
                else:
                    parts.append(str(item))
            else:
                parts.append(str(item))
        cc_raw = ", ".join(p for p in parts if p)

    subject = str(form.get("subject") or form.get("Subject") or "")
    text_body = str(form.get("text") or form.get("textBody") or form.get("bodyPreview") or "")
    html_body = str(form.get("html") or form.get("htmlBody") or "")
    body_field = form.get("body") or form.get("Body")
    if body_field and not text_body and not html_body:
        body_s = str(body_field)
        if "<" in body_s and ">" in body_s:
            html_body = body_s
        else:
            text_body = body_s
    elif body_field and not html_body and ("<" in str(body_field)):
        html_body = str(body_field)

    headers = str(form.get("headers") or "")
    message_id = parse_message_id_from_headers(headers)
    if not message_id:
        message_id = str(
            form.get("message_id")
            or form.get("Message-Id")
            or form.get("internet_message_id")
            or form.get("internetMessageId")
            or form.get("InternetMessageId")
            or form.get("id")
            or form.get("Id")
            or ""
        ).strip()

    envelope_to: list[str] = []
    envelope_raw = form.get("envelope")
    if envelope_raw:
        try:
            import json

            env = json.loads(envelope_raw) if isinstance(envelope_raw, str) else envelope_raw
            to_list = env.get("to") if isinstance(env, dict) else None
            if isinstance(to_list, list):
                for item in to_list:
                    addr = extract_email_address(str(item))
                    if addr:
                        envelope_to.append(addr)
            elif isinstance(to_list, str):
                envelope_to.extend(extract_email_addresses_from_header(to_list))
        except Exception:
            pass

    # Power Automate often puts the mailbox address only in `to`
    if not envelope_to and to_raw:
        envelope_to = extract_email_addresses_from_header(to_raw)

    from_name, from_addr = parseaddr(from_raw)
    from_email = (from_addr or extract_email_address(from_raw) or "").lower()

    attachments: list[InboundAttachment] = []
    for field_name, filename, content_type, content in files:
        if not content:
            continue
        lower = (field_name or "").lower()
        if lower in {"from", "to", "cc", "subject", "text", "html", "headers", "envelope", "charsets", "spam_report"}:
            continue
        attachments.append(
            InboundAttachment(
                filename=filename or field_name or "attachment",
                content_type=content_type or "application/octet-stream",
                content=content,
            )
        )
    attachments.extend(_decode_json_attachments(form))

    return ParsedInboundEmail(
        from_raw=from_raw,
        from_email=from_email,
        from_name=(from_name or "").strip(),
        to_raw=to_raw if isinstance(to_raw, str) else str(to_raw),
        cc_raw=cc_raw if isinstance(cc_raw, str) else str(cc_raw),
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        message_id=message_id,
        envelope_to=envelope_to,
        attachments=attachments,
    )
