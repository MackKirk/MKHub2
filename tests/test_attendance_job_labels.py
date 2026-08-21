"""Tests for attendance job label resolution."""
import unittest
import uuid
from unittest.mock import MagicMock

from app.services.attendance_job_labels import (
    collect_project_ids_from_job_types,
    format_project_job_label,
    parse_job_type_from_reason_text,
    resolve_job_label,
)


class _ProjectStub:
    def __init__(self, *, pid=None, name="Test Project", code="MK-001"):
        self.id = pid or uuid.uuid4()
        self.name = name
        self.code = code
        self.deleted_at = None


class TestAttendanceJobLabels(unittest.TestCase):
    def test_parse_job_type_from_reason_text(self):
        self.assertEqual(
            parse_job_type_from_reason_text("JOB_TYPE:0|HOURS_WORKED:8"),
            "0",
        )
        self.assertIsNone(parse_job_type_from_reason_text("other"))
        self.assertEqual(
            parse_job_type_from_reason_text("JOB_TYPE:0|SERVICE_ITEM:regular|note"),
            "0",
        )

    def test_parse_and_compose_service_item(self):
        from app.services.attendance_job_labels import (
            compose_reason_text,
            parse_service_item_from_reason_text,
        )

        composed = compose_reason_text(
            job_type="0",
            service_item="regular",
            notes="late start",
        )
        self.assertEqual(composed, "JOB_TYPE:0|SERVICE_ITEM:regular|late start")
        self.assertEqual(parse_service_item_from_reason_text(composed), "regular")
        self.assertIsNone(parse_service_item_from_reason_text("JOB_TYPE:0|note"))

    def test_format_project_job_label(self):
        project = _ProjectStub(name="2770 Bentall Street - WO 11285", code="MK-00332/00179-2026")
        self.assertEqual(
            format_project_job_label(project),
            "2770 Bentall Street - WO 11285 (MK-00332/00179-2026)",
        )

    def test_resolve_predefined_job(self):
        db = MagicMock()
        job_name, project_name = resolve_job_label(db, "0")
        self.assertEqual(job_name, "No Project Assigned")
        self.assertIsNone(project_name)

    def test_resolve_predefined_repairs(self):
        db = MagicMock()
        job_name, _ = resolve_job_label(db, "37")
        self.assertEqual(job_name, "Repairs")

    def test_resolve_project_uuid_from_cache(self):
        db = MagicMock()
        project = _ProjectStub(name="Site A", code="MK-100")
        projects_by_id = {str(project.id): project}
        job_name, project_name = resolve_job_label(
            db,
            str(project.id),
            projects_by_id=projects_by_id,
        )
        self.assertEqual(job_name, "Site A (MK-100)")
        self.assertEqual(project_name, "Site A")
        db.query.assert_not_called()

    def test_resolve_missing_project_uuid(self):
        db = MagicMock()
        missing_id = str(uuid.uuid4())
        db.query.return_value.filter.return_value.first.return_value = None
        job_name, project_name = resolve_job_label(db, missing_id)
        self.assertEqual(job_name, "Unknown")
        self.assertIsNone(project_name)

    def test_collect_project_ids_skips_predefined(self):
        project_id = uuid.uuid4()
        ids = collect_project_ids_from_job_types(["0", "37", str(project_id), "not-a-uuid"])
        self.assertEqual(ids, [project_id])


if __name__ == "__main__":
    unittest.main()
