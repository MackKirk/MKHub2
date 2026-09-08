"""Tests for Attendance period dual-read helpers."""
import unittest
import uuid
from types import SimpleNamespace

from app.services.attendance_job_labels import compose_reason_text
from app.services.attendance_period import (
    effective_declared_hours,
    effective_entry_kind,
    effective_job_type,
    split_job_ref,
)


class TestSplitJobRef(unittest.TestCase):
    def test_predefined(self):
        project_id, code = split_job_ref("47")
        self.assertIsNone(project_id)
        self.assertEqual(code, "47")

    def test_project_uuid(self):
        pid = uuid.uuid4()
        project_id, code = split_job_ref(str(pid))
        self.assertEqual(project_id, pid)
        self.assertIsNone(code)


class TestEffectiveFields(unittest.TestCase):
    def test_job_type_prefers_project_id_column(self):
        pid = uuid.uuid4()
        att = SimpleNamespace(
            project_id=pid,
            predefined_job_code=None,
            reason_text="JOB_TYPE:0|SERVICE_ITEM:regular",
        )
        self.assertEqual(effective_job_type(att), str(pid))

    def test_job_type_falls_back_to_marker(self):
        att = SimpleNamespace(
            project_id=None,
            predefined_job_code=None,
            reason_text="JOB_TYPE:47|SERVICE_ITEM:regular|note",
        )
        self.assertEqual(effective_job_type(att), "47")

    def test_hours_only_from_column(self):
        att = SimpleNamespace(
            entry_kind="hours_only",
            declared_hours=8.5,
            reason_text="JOB_TYPE:0",
        )
        self.assertEqual(effective_entry_kind(att), "hours_only")
        self.assertEqual(effective_declared_hours(att), 8.5)

    def test_hours_only_from_marker(self):
        att = SimpleNamespace(
            entry_kind=None,
            declared_hours=None,
            reason_text=compose_reason_text(job_type="0", hours_worked="6"),
        )
        self.assertEqual(effective_entry_kind(att), "hours_only")
        self.assertEqual(effective_declared_hours(att), 6.0)

    def test_omitted_work_type_is_clock(self):
        att = SimpleNamespace(
            entry_kind=None,
            declared_hours=None,
            reason_text="JOB_TYPE:0|SERVICE_ITEM:regular",
        )
        self.assertEqual(effective_entry_kind(att), "clock")


if __name__ == "__main__":
    unittest.main()
