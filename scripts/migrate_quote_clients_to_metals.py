#!/usr/bin/env python3
"""
Clone Hub clients referenced by quotes into metals_* tables, remap quotes.client_id,
and hide quote-only Hub rows from Hub list (serves_hub=false).

Never deletes Hub clients or children.

Usage:
  python scripts/migrate_quote_clients_to_metals.py --dry-run
  python scripts/migrate_quote_clients_to_metals.py --apply
  python scripts/migrate_quote_clients_to_metals.py --rollback
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime
from typing import Any, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

CLIENT_SCALAR_FIELDS = [
    "code",
    "name",
    "legal_name",
    "display_name",
    "client_type",
    "client_status",
    "lead_source",
    "estimator_id",
    "description",
    "address_line1",
    "address_line2",
    "city",
    "province",
    "postal_code",
    "country",
    "billing_address_line1",
    "billing_address_line2",
    "billing_city",
    "billing_province",
    "billing_postal_code",
    "billing_country",
    "billing_same_as_address",
    "type_id",
    "status_id",
    "payment_terms_id",
    "billing_contact",
    "invoice_to",
    "billing_email",
    "po_required",
    "tax_number",
    "preferred_language",
    "preferred_channels",
    "marketing_opt_in",
    "invoice_delivery_method",
    "statement_delivery_method",
    "cc_emails_for_invoices",
    "cc_emails_for_estimates",
    "do_not_contact",
    "do_not_contact_reason",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "deleted_at",
    "deleted_by_id",
]


def _ensure_tables() -> None:
    from app.db import Base, engine
    from app.models import models as m

    Base.metadata.create_all(
        bind=engine,
        tables=[
            m.MetalsClient.__table__,
            m.MetalsClientContact.__table__,
            m.MetalsClientSite.__table__,
            m.MetalsClientFolder.__table__,
            m.MetalsClientFile.__table__,
            m.MetalsClientDocument.__table__,
            m.MetalsClientNote.__table__,
            m.MetalsMigrationBatch.__table__,
            m.MetalsClientIdMap.__table__,
            m.MetalsContactIdMap.__table__,
            m.MetalsSiteIdMap.__table__,
            m.MetalsFolderIdMap.__table__,
            m.MetalsFileIdMap.__table__,
            m.MetalsDocumentIdMap.__table__,
            m.MetalsNoteIdMap.__table__,
        ],
    )


def _hub_client_ids_from_quotes(db) -> list[uuid.UUID]:
    from app.models.models import Quote

    rows = db.query(Quote.client_id).filter(Quote.client_id.isnot(None)).distinct().all()
    out: list[uuid.UUID] = []
    for r in rows:
        cid = r[0]  # SQLAlchemy Row / keyed tuple
        if cid:
            out.append(cid)
    return out


def _project_references_client(db, hub_client_id: uuid.UUID) -> bool:
    from app.models.models import Project

    sid = str(hub_client_id)
    if db.query(Project.id).filter(Project.client_id == hub_client_id).first():
        return True
    # related / awarded JSON arrays
    projects = db.query(Project.related_client_ids, Project.awarded_related_client_ids, Project.awarded_related_client_id).all()
    for related, awarded_ids, awarded_one in projects:
        if awarded_one and str(awarded_one) == sid:
            return True
        for arr in (related, awarded_ids):
            if not arr:
                continue
            for x in arr:
                if str(x) == sid:
                    return True
    return False


def _clone_client(db, hub_client, batch_id: uuid.UUID) -> uuid.UUID:
    from app.models.models import (
        ClientContact,
        ClientDocument,
        ClientFile,
        ClientFolder,
        ClientNote,
        ClientSite,
        MetalsClient,
        MetalsClientContact,
        MetalsClientDocument,
        MetalsClientFile,
        MetalsClientFolder,
        MetalsClientIdMap,
        MetalsClientNote,
        MetalsClientSite,
        MetalsContactIdMap,
        MetalsDocumentIdMap,
        MetalsFileIdMap,
        MetalsFolderIdMap,
        MetalsNoteIdMap,
        MetalsSiteIdMap,
    )

    existing = db.query(MetalsClientIdMap).filter(MetalsClientIdMap.hub_client_id == hub_client.id).first()
    if existing:
        return existing.metals_client_id

    kwargs: dict[str, Any] = {"id": uuid.uuid4(), "is_system": False}
    for f in CLIENT_SCALAR_FIELDS:
        kwargs[f] = getattr(hub_client, f, None)
    # Avoid unique collision on dataforma_id across products
    if kwargs.get("dataforma_id"):
        kwargs["dataforma_id"] = f"metals-mig:{kwargs['dataforma_id']}"

    # Code uniqueness within metals_clients only
    code = kwargs.get("code")
    if code:
        clash = db.query(MetalsClient).filter(MetalsClient.code == code).first()
        if clash:
            kwargs["code"] = f"M{code}"[:50]

    mc = MetalsClient(**kwargs)
    db.add(mc)
    db.flush()

    db.add(
        MetalsClientIdMap(
            hub_client_id=hub_client.id,
            metals_client_id=mc.id,
            batch_id=batch_id,
        )
    )

    # Contacts
    for c in db.query(ClientContact).filter(ClientContact.client_id == hub_client.id).all():
        nc = MetalsClientContact(
            id=uuid.uuid4(),
            client_id=mc.id,
            name=c.name,
            role_title=c.role_title,
            department=c.department,
            email=c.email,
            phone=c.phone,
            phone_extension=c.phone_extension,
            mobile_phone=c.mobile_phone,
            is_primary=c.is_primary,
            sort_index=c.sort_index,
            notes=c.notes,
            role_tags=c.role_tags,
        )
        db.add(nc)
        db.flush()
        db.add(
            MetalsContactIdMap(
                hub_contact_id=c.id,
                metals_contact_id=nc.id,
                hub_client_id=hub_client.id,
                batch_id=batch_id,
            )
        )

    # Sites
    site_map: dict[uuid.UUID, uuid.UUID] = {}
    for s in db.query(ClientSite).filter(ClientSite.client_id == hub_client.id).all():
        ns = MetalsClientSite(
            id=uuid.uuid4(),
            client_id=mc.id,
            site_name=s.site_name,
            site_address_line1=s.site_address_line1,
            site_address_line1_complement=s.site_address_line1_complement,
            site_address_line2=s.site_address_line2,
            site_address_line2_complement=s.site_address_line2_complement,
            site_address_line3=s.site_address_line3,
            site_address_line3_complement=s.site_address_line3_complement,
            site_city=s.site_city,
            site_province=s.site_province,
            site_postal_code=s.site_postal_code,
            site_country=s.site_country,
            site_lat=s.site_lat,
            site_lng=s.site_lng,
            site_notes=s.site_notes,
            sort_index=s.sort_index,
        )
        db.add(ns)
        db.flush()
        site_map[s.id] = ns.id
        db.add(
            MetalsSiteIdMap(
                hub_site_id=s.id,
                metals_site_id=ns.id,
                hub_client_id=hub_client.id,
                batch_id=batch_id,
            )
        )

    # Folders (skip project-linked); topological by parent
    folders = (
        db.query(ClientFolder)
        .filter(ClientFolder.client_id == hub_client.id, ClientFolder.project_id.is_(None))
        .all()
    )
    folder_map: dict[uuid.UUID, uuid.UUID] = {}
    remaining = {f.id: f for f in folders}
    while remaining:
        progress = False
        for fid, f in list(remaining.items()):
            if f.parent_id and f.parent_id not in folder_map and f.parent_id in remaining:
                continue
            parent_metals = folder_map.get(f.parent_id) if f.parent_id else None
            nf = MetalsClientFolder(
                id=uuid.uuid4(),
                client_id=mc.id,
                name=f.name,
                parent_id=parent_metals,
                sort_index=f.sort_index,
                created_at=f.created_at,
                created_by=f.created_by,
                access_permissions=f.access_permissions,
            )
            db.add(nf)
            db.flush()
            folder_map[f.id] = nf.id
            db.add(
                MetalsFolderIdMap(
                    hub_folder_id=f.id,
                    metals_folder_id=nf.id,
                    hub_client_id=hub_client.id,
                    batch_id=batch_id,
                )
            )
            del remaining[fid]
            progress = True
        if not progress:
            # cycle / orphan parent — attach at root
            for fid, f in list(remaining.items()):
                nf = MetalsClientFolder(
                    id=uuid.uuid4(),
                    client_id=mc.id,
                    name=f.name,
                    parent_id=None,
                    sort_index=f.sort_index,
                    created_at=f.created_at,
                    created_by=f.created_by,
                    access_permissions=f.access_permissions,
                )
                db.add(nf)
                db.flush()
                folder_map[f.id] = nf.id
                db.add(
                    MetalsFolderIdMap(
                        hub_folder_id=f.id,
                        metals_folder_id=nf.id,
                        hub_client_id=hub_client.id,
                        batch_id=batch_id,
                    )
                )
                del remaining[fid]
            break

    # Documents
    for d in db.query(ClientDocument).filter(ClientDocument.client_id == hub_client.id).all():
        doc_type = d.doc_type or ""
        if doc_type.startswith("folder:"):
            try:
                old_fid = uuid.UUID(doc_type.split(":", 1)[1])
                new_fid = folder_map.get(old_fid)
                if new_fid:
                    doc_type = f"folder:{new_fid}"
            except Exception:
                pass
        nd = MetalsClientDocument(
            id=uuid.uuid4(),
            client_id=mc.id,
            doc_type=doc_type,
            title=d.title,
            notes=d.notes,
            file_id=d.file_id,
            created_at=d.created_at,
            created_by=d.created_by,
            updated_at=d.updated_at,
            updated_by=d.updated_by,
            deleted_at=d.deleted_at,
            deleted_by=d.deleted_by,
        )
        db.add(nd)
        db.flush()
        db.add(
            MetalsDocumentIdMap(
                hub_document_id=d.id,
                metals_document_id=nd.id,
                hub_client_id=hub_client.id,
                batch_id=batch_id,
            )
        )

    # Files (reuse file_object_id; skip warranty-linked only if we want — still clone attachment)
    for f in db.query(ClientFile).filter(ClientFile.client_id == hub_client.id).all():
        metals_site = site_map.get(f.site_id) if f.site_id else None
        # Hub folder_id points at project_folders — do not copy that FK
        metals_folder = folder_map.get(f.folder_id) if f.folder_id and f.folder_id in folder_map else None
        nf = MetalsClientFile(
            id=uuid.uuid4(),
            client_id=mc.id,
            site_id=metals_site,
            file_object_id=f.file_object_id,
            category=f.category,
            folder_id=metals_folder,
            key=f.key,
            original_name=f.original_name,
            uploaded_at=f.uploaded_at,
            uploaded_by=f.uploaded_by,
            notes=f.notes,
            deleted_at=f.deleted_at,
            deleted_by_id=f.deleted_by_id,
            customer_visible=bool(getattr(f, "customer_visible", False)),
        )
        db.add(nf)
        db.flush()
        db.add(
            MetalsFileIdMap(
                hub_file_id=f.id,
                metals_file_id=nf.id,
                hub_client_id=hub_client.id,
                batch_id=batch_id,
            )
        )

    # Notes without project_id
    for n in (
        db.query(ClientNote)
        .filter(ClientNote.client_id == hub_client.id, ClientNote.project_id.is_(None))
        .all()
    ):
        nn = MetalsClientNote(
            id=uuid.uuid4(),
            client_id=mc.id,
            title=n.title,
            category_id=n.category_id,
            description=n.description,
            images=n.images,
            status=n.status,
            created_at=n.created_at,
            created_by=n.created_by,
            updated_at=n.updated_at,
            updated_by=n.updated_by,
        )
        db.add(nn)
        db.flush()
        db.add(
            MetalsNoteIdMap(
                hub_note_id=n.id,
                metals_note_id=nn.id,
                hub_client_id=hub_client.id,
                batch_id=batch_id,
            )
        )

    return mc.id


def _patch_quote_data(data: Any, client_map: dict[str, str], site_map: dict[str, str]) -> Any:
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            if k in ("client_id", "customer_id") and v is not None and str(v) in client_map:
                out[k] = client_map[str(v)]
            elif k == "site_id" and v is not None and str(v) in site_map:
                out[k] = site_map[str(v)]
            else:
                out[k] = _patch_quote_data(v, client_map, site_map)
        return out
    if isinstance(data, list):
        return [_patch_quote_data(x, client_map, site_map) for x in data]
    return data


def run_migrate(apply: bool) -> int:
    from sqlalchemy.orm import Session

    from app.db import SessionLocal
    from app.models.models import (
        Client,
        ClientContact,
        ClientFile,
        ClientSite,
        MetalsClient,
        MetalsClientIdMap,
        MetalsMigrationBatch,
        MetalsSiteIdMap,
        Quote,
    )

    _ensure_tables()
    db: Session = SessionLocal()
    mode = "apply" if apply else "dry-run"
    batch_id = uuid.uuid4()
    try:
        hub_ids = _hub_client_ids_from_quotes(db)
        quotes_count = db.query(Quote).count()
        print(f"[{mode}] quotes={quotes_count} distinct_hub_clients={len(hub_ids)}")

        batch = MetalsMigrationBatch(
            id=batch_id,
            mode=mode,
            quotes_count=quotes_count,
            distinct_hub_clients=len(hub_ids),
            ok=False,
        )
        if apply:
            db.add(batch)
            db.flush()

        cloned = 0
        planned_map: list[tuple[uuid.UUID, str]] = []
        for hid in hub_ids:
            hub = db.query(Client).filter(Client.id == hid).first()
            if not hub:
                print(f"  WARN missing Hub client {hid} (still will fail verify if quotes point here)")
                continue
            name = hub.display_name or hub.name or str(hid)
            planned_map.append((hid, name))
            if apply:
                before = db.query(MetalsClientIdMap).filter(MetalsClientIdMap.hub_client_id == hid).first()
                _clone_client(db, hub, batch_id)
                if not before:
                    cloned += 1
            else:
                exists = db.query(MetalsClientIdMap).filter(MetalsClientIdMap.hub_client_id == hid).first()
                print(f"  would clone {'(already mapped)' if exists else ''}: {name} ({hid})")

        remapped = 0
        hub_hidden = 0
        if apply:
            maps = {m.hub_client_id: m.metals_client_id for m in db.query(MetalsClientIdMap).all()}
            metals_ids = set(maps.values())
            site_maps = {str(m.hub_site_id): str(m.metals_site_id) for m in db.query(MetalsSiteIdMap).all()}
            client_maps_str = {str(k): str(v) for k, v in maps.items()}

            for q in db.query(Quote).all():
                if not q.client_id:
                    continue
                # Already remapped on a previous run
                if q.client_id in metals_ids:
                    if q.data:
                        q.data = _patch_quote_data(q.data, client_maps_str, site_maps)
                    continue
                if q.client_id in maps:
                    q.client_id = maps[q.client_id]
                    remapped += 1
                    if q.data:
                        q.data = _patch_quote_data(q.data, client_maps_str, site_maps)

            for hid, _name in planned_map:
                if not _project_references_client(db, hid):
                    hub = db.query(Client).filter(Client.id == hid).first()
                    if hub and getattr(hub, "serves_hub", True):
                        hub.serves_hub = False
                        hub_hidden += 1

            # Persist session changes before SQL verification joins
            db.flush()
            print(f"  maps={len(maps)} remapped_quotes={remapped} hub_hidden={hub_hidden}")

            # Verify gates
            orphan_quotes = (
                db.query(Quote.id, Quote.client_id)
                .outerjoin(MetalsClient, Quote.client_id == MetalsClient.id)
                .filter(MetalsClient.id.is_(None), Quote.client_id.isnot(None))
                .all()
            )
            if orphan_quotes:
                db.rollback()
                print(f"VERIFY FAIL: {len(orphan_quotes)} quotes without metals_clients row")
                for qid, cid in orphan_quotes[:10]:
                    print(f"  quote={qid} client_id={cid}")
                return 1

            post_count = db.query(Quote).count()
            if post_count != quotes_count:
                db.rollback()
                print(f"VERIFY FAIL: quotes count changed {quotes_count} -> {post_count}")
                return 1

            for hid, name in planned_map:
                if hid not in maps and not db.query(MetalsClientIdMap).filter(MetalsClientIdMap.hub_client_id == hid).first():
                    db.rollback()
                    print(f"VERIFY FAIL: no map for hub client {name} ({hid})")
                    return 1

            # Child parity spot-check
            for hid in list(maps.keys())[:50]:
                mid = maps[hid]
                hc = db.query(ClientContact).filter(ClientContact.client_id == hid).count()
                from app.models.models import MetalsClientContact

                mc = db.query(MetalsClientContact).filter(MetalsClientContact.client_id == mid).count()
                if hc != mc:
                    print(f"  WARN contact count mismatch hub={hid}: {hc} vs metals={mc}")
                hs = db.query(ClientSite).filter(ClientSite.client_id == hid).count()
                from app.models.models import MetalsClientSite

                ms = db.query(MetalsClientSite).filter(MetalsClientSite.client_id == mid).count()
                if hs != ms:
                    print(f"  WARN site count mismatch hub={hid}: {hs} vs metals={ms}")
                hf = db.query(ClientFile).filter(ClientFile.client_id == hid).count()
                from app.models.models import MetalsClientFile

                mf = db.query(MetalsClientFile).filter(MetalsClientFile.client_id == mid).count()
                if hf != mf:
                    print(f"  WARN file count mismatch hub={hid}: {hf} vs metals={mf}")

            batch.cloned_clients = cloned
            batch.remapped_quotes = remapped
            batch.hub_hidden = hub_hidden
            batch.finished_at = datetime.utcnow()
            batch.ok = True
            batch.notes = json.dumps({"planned": len(planned_map)})
            db.commit()
            print(
                f"[apply] OK cloned={cloned} remapped_quotes={remapped} hub_hidden={hub_hidden} batch={batch_id}"
            )
        else:
            print(f"[dry-run] would process {len(planned_map)} clients; no DB writes")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


def run_rollback() -> int:
    from sqlalchemy.orm import Session

    from app.db import SessionLocal
    from app.models.models import Client, MetalsClientIdMap, Quote

    _ensure_tables()
    db: Session = SessionLocal()
    try:
        maps = list(db.query(MetalsClientIdMap).all())
        reverse = {m.metals_client_id: m.hub_client_id for m in maps}
        restored = 0
        for q in db.query(Quote).all():
            if q.client_id in reverse:
                q.client_id = reverse[q.client_id]
                restored += 1
        for m in maps:
            hub = db.query(Client).filter(Client.id == m.hub_client_id).first()
            if hub:
                hub.serves_hub = True
        db.commit()
        print(f"[rollback] restored quote client_ids={restored}; serves_hub=true for mapped hub clients")
        print("Note: metals_* clone rows left in place (safe). Re-apply is idempotent via map.")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


def main() -> None:
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--rollback", action="store_true")
    args = p.parse_args()
    if args.rollback:
        raise SystemExit(run_rollback())
    raise SystemExit(run_migrate(apply=bool(args.apply)))


if __name__ == "__main__":
    main()
