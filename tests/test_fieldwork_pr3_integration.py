"""
PR3 integration checks against a disposable DATABASE_URL only.

MKHub has no staging DB — local .env often points at production Render `db_mkhub`.
These tests can ALTER/create_all and seed phrase list rows, so they refuse to run
against production-like URLs unless ALLOW_FIELDWORK_PROD_DB_TESTS=1 is set explicitly.

Prefer: sqlite:///./var/fieldwork_pr3_test.db or another disposable Postgres.
"""
from __future__ import annotations

import os
import sys
import types
import unittest
import uuid

if "jwt" not in sys.modules:
    jwt_module = types.ModuleType("jwt")
    jwt_module.encode = lambda *args, **kwargs: "token"
    jwt_module.decode = lambda *args, **kwargs: {}
    sys.modules["jwt"] = jwt_module

if "passlib.context" not in sys.modules:
    passlib_module = types.ModuleType("passlib")
    passlib_context_module = types.ModuleType("passlib.context")

    class _CryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, value):
            return f"hashed:{value}"

        def verify(self, plain, hashed):
            return hashed == f"hashed:{plain}"

    passlib_context_module.CryptContext = _CryptContext
    sys.modules["passlib"] = passlib_module
    sys.modules["passlib.context"] = passlib_context_module


def _load_env_database_url() -> str | None:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    try:
        with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == "DATABASE_URL":
                    return v.strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def _is_production_like_database_url(url: str) -> bool:
    lower = (url or "").lower()
    if lower.startswith("sqlite"):
        return False
    return (
        "render.com" in lower
        or "dpg-" in lower
        or "/db_mkhub" in lower
        or lower.rstrip("/").endswith("db_mkhub")
    )


def _resolve_integration_database_url() -> tuple[str | None, str]:
    """Return (url, skip_reason). Empty skip_reason means OK to run."""
    explicit = (os.environ.get("FIELDWORK_INTEGRATION_DATABASE_URL") or "").strip()
    url = explicit or _load_env_database_url()
    if not url:
        return None, "No DATABASE_URL / FIELDWORK_INTEGRATION_DATABASE_URL configured"
    allow_prod = (os.environ.get("ALLOW_FIELDWORK_PROD_DB_TESTS") or "").strip() == "1"
    if _is_production_like_database_url(url) and not allow_prod:
        return None, (
            "Refusing fieldwork integration tests against production-like DATABASE_URL "
            "(Render / db_mkhub). Use FIELDWORK_INTEGRATION_DATABASE_URL=sqlite:///./var/fieldwork_pr3_test.db "
            "or set ALLOW_FIELDWORK_PROD_DB_TESTS=1 only with intentional oversight."
        )
    return url, ""


def _ensure_pr_schema(engine) -> None:
    """Mirror startup ensures required for Fieldwork PR0–PR2."""
    from sqlalchemy import inspect as sa_inspect, text
    from app.db import Base
    from app.models import models as _models  # noqa: F401 — register mappers

    # Disposable SQLite path for local runs that must not touch production Postgres.
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(
            bind=engine,
            tables=[
                _models.FormCustomList.__table__,
                _models.FormCustomListItem.__table__,
                _models.FormTemplate.__table__,
                _models.FieldworkRecord.__table__,
                _models.FieldworkPhotoObservation.__table__,
                _models.FieldworkRecordEvent.__table__,
            ],
        )
        from sqlalchemy.orm import sessionmaker
        from app.services.fieldwork_phrases import ensure_fieldwork_phrase_lists

        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            ensure_fieldwork_phrase_lists(db, commit=True)
        finally:
            db.close()
        return

    with engine.begin() as conn:
        # Domain column on form_custom_lists
        has_domain = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'form_custom_lists'
                  AND column_name = 'domain'
                """
            )
        ).first()
        if not has_domain:
            conn.execute(
                text(
                    "ALTER TABLE form_custom_lists "
                    "ADD COLUMN domain VARCHAR(40) NOT NULL DEFAULT 'shared'"
                )
            )

        # definition_version on form_templates (PR0)
        has_def_ver = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'form_templates'
                  AND column_name = 'definition_version'
                """
            )
        ).first()
        if not has_def_ver:
            conn.execute(
                text(
                    "ALTER TABLE form_templates "
                    "ADD COLUMN definition_version INTEGER NOT NULL DEFAULT 1"
                )
            )

    Base.metadata.create_all(
        bind=engine,
        tables=[
            _models.FieldworkRecord.__table__,
            _models.FieldworkPhotoObservation.__table__,
            _models.FieldworkRecordEvent.__table__,
        ],
    )

    # Persist empty phrase catalogs (idempotent) so admin UI / API have targets.
    from sqlalchemy.orm import sessionmaker
    from app.services.fieldwork_phrases import ensure_fieldwork_phrase_lists

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        ensure_fieldwork_phrase_lists(db, commit=True)
    finally:
        db.close()

    insp = sa_inspect(engine)
    assert "fieldwork_records" in insp.get_table_names()


class FieldworkPr3IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_url, cls._skip_reason = _resolve_integration_database_url()
        cls.engine = None
        cls.Session = None
        if not cls.db_url:
            return
        try:
            from sqlalchemy import create_engine, text
            from sqlalchemy.orm import sessionmaker

            # Ensure parent dir exists for sqlite file URLs.
            if cls.db_url.lower().startswith("sqlite:///./"):
                os.makedirs(os.path.join(os.path.dirname(__file__), "..", "var"), exist_ok=True)

            cls.engine = create_engine(cls.db_url, pool_pre_ping=True)
            with cls.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            _ensure_pr_schema(cls.engine)
            cls.Session = sessionmaker(bind=cls.engine)
            cls._skip_reason = ""
        except Exception as exc:  # pragma: no cover - environment dependent
            cls.engine = None
            cls._skip_reason = f"Database unavailable: {exc}"

    def setUp(self):
        if not self.engine or not self.Session:
            self.skipTest(self._skip_reason or "DATABASE_URL not configured")

    def test_fieldwork_tables_and_row_version_column(self):
        from sqlalchemy import inspect as sa_inspect

        insp = sa_inspect(self.engine)
        tables = set(insp.get_table_names())
        for required in ("fieldwork_records", "fieldwork_photo_observations", "fieldwork_record_events"):
            self.assertIn(required, tables, f"missing table {required}")
        cols = {c["name"] for c in insp.get_columns("fieldwork_records")}
        for required in ("row_version", "status", "kind", "form_definition_snapshot", "settings_snapshot"):
            self.assertIn(required, cols)
        list_cols = {c["name"] for c in insp.get_columns("form_custom_lists")}
        self.assertIn("domain", list_cols)

    def test_phrase_catalog_seed_and_domain_isolation_rollback(self):
        from app.services.fieldwork_phrases import (
            OBSERVED_CONDITIONS_LIST_NAME,
            WORK_PERFORMED_LIST_NAME,
            ensure_fieldwork_phrase_lists,
            resolve_phrase_snapshots,
        )
        from app.services.form_engine import (
            FIELDWORK_PHOTO_ENTRY_OBSERVATION,
            LIST_DOMAIN_FIELDWORK,
            LIST_DOMAIN_SAFETY,
        )
        from app.models.models import FormCustomList, FormCustomListItem
        from fastapi import HTTPException

        db = self.Session()
        try:
            ids = ensure_fieldwork_phrase_lists(db, commit=False)
            self.assertIn(FIELDWORK_PHOTO_ENTRY_OBSERVATION, ids)

            observed = (
                db.query(FormCustomList)
                .filter(
                    FormCustomList.name == OBSERVED_CONDITIONS_LIST_NAME,
                    FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
                )
                .one()
            )
            performed = (
                db.query(FormCustomList)
                .filter(
                    FormCustomList.name == WORK_PERFORMED_LIST_NAME,
                    FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
                )
                .one()
            )
            self.assertEqual(observed.domain, LIST_DOMAIN_FIELDWORK)
            self.assertEqual(performed.domain, LIST_DOMAIN_FIELDWORK)

            safety_list = FormCustomList(
                name=f"tmp-safety-{uuid.uuid4().hex[:8]}",
                status="active",
                domain=LIST_DOMAIN_SAFETY,
                include_other=False,
            )
            db.add(safety_list)
            db.flush()
            safety_item = FormCustomListItem(
                list_id=safety_list.id,
                parent_id=None,
                name="Safety phrase",
                sort_order=0,
                depth=0,
                status="active",
            )
            db.add(safety_item)
            db.flush()

            with self.assertRaises(HTTPException) as ctx:
                resolve_phrase_snapshots(
                    db,
                    entry_type=FIELDWORK_PHOTO_ENTRY_OBSERVATION,
                    phrase_item_id=safety_item.id,
                )
            self.assertEqual(ctx.exception.status_code, 400)

            phrase = FormCustomListItem(
                list_id=observed.id,
                parent_id=None,
                name=f"tmp-obs-{uuid.uuid4().hex[:6]}",
                sort_order=0,
                depth=0,
                status="active",
            )
            db.add(phrase)
            db.flush()
            class_snap, phrase_snap, _cid, pid = resolve_phrase_snapshots(
                db,
                entry_type=FIELDWORK_PHOTO_ENTRY_OBSERVATION,
                phrase_item_id=phrase.id,
            )
            self.assertEqual(phrase_snap, phrase.name)
            self.assertEqual(pid, phrase.id)
            self.assertTrue(class_snap)

            from sqlalchemy import text as sql_text

            # Postgres row-lock probe; SQLite disposable DBs do not support FOR UPDATE.
            if db.bind is not None and db.bind.dialect.name != "sqlite":
                db.execute(sql_text("SELECT id FROM fieldwork_records WHERE false FOR UPDATE"))
        finally:
            db.rollback()
            db.close()

    def test_template_fieldwork_settings_roundtrip_normalize(self):
        from app.routes import form_templates as ft
        from fastapi import HTTPException

        ok = ft._normalize_definition(
            {
                "sections": [],
                "fieldwork_settings": {
                    "require_final_comments": True,
                    "require_min_photos": 2,
                    "default_pictures_folder": "Proposal Photos",
                },
            }
        )
        self.assertEqual(ok["fieldwork_settings"]["require_min_photos"], 2)
        with self.assertRaises(HTTPException):
            ft._normalize_fieldwork_settings({"default_pictures_folder": "Nope"})


if __name__ == "__main__":
    unittest.main()
