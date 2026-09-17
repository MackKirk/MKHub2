"""VeriClock Activity Report parsing and name matching."""
import unittest
import uuid

from app.services.sage_export import SOURCE_VERICLOCK, refresh_sage_export_state
from app.services.vericlock_import import (
    apply_vericlock_attendance,
    compact_job_code,
    import_action_for_ref,
    parse_activity_csv,
    parse_duration_hours,
    parse_job_field,
    parse_local_datetime,
    parse_person_name,
    resolve_job,
    suggest_hub_match,
    unique_jobs,
    unique_people,
)
from tests.test_sage_export import _att


class TestVeriClockNames(unittest.TestCase):
    def test_last_comma_first(self):
        self.assertEqual(parse_person_name("Agbunag, Reymund"), ("Reymund", "Agbunag"))

    def test_first_last(self):
        self.assertEqual(parse_person_name("Alex Costelo"), ("Alex", "Costelo"))

    def test_hyphenated_last(self):
        first, last = parse_person_name("Samuel Couture-Girard")
        self.assertEqual(first, "Samuel")
        self.assertEqual(last, "Couture-Girard")

    def test_exact_match(self):
        hub = [
            {"id": "u1", "name": "Reymund Agbunag", "first_name": "Reymund", "last_name": "Agbunag"},
            {"id": "u2", "name": "Alex Costelo", "first_name": "Alex", "last_name": "Costelo"},
        ]
        hit = suggest_hub_match("Reymund", "Agbunag", hub)
        self.assertEqual(hit["hub_user_id"], "u1")
        self.assertEqual(hit["confidence"], "exact")

    def test_reversed_name_is_weak_match(self):
        hub = [{"id": "u1", "name": "Gurpreet Singh", "first_name": "Gurpreet", "last_name": "Singh"}]
        hit = suggest_hub_match("Singh", "Gurpreet", hub)
        self.assertEqual(hit["hub_user_id"], "u1")
        self.assertEqual(hit["confidence"], "reversed")

    def test_ambiguous_same_name_is_not_auto_matched(self):
        hub = [
            {"id": "u1", "name": "Alex Costelo", "first_name": "Alex", "last_name": "Costelo"},
            {"id": "u2", "name": "Alex Costelo", "first_name": "Alex", "last_name": "Costelo"},
        ]
        self.assertIsNone(suggest_hub_match("Alex", "Costelo", hub))


class TestVeriClockCsv(unittest.TestCase):
    def test_duration_and_job(self):
        self.assertEqual(parse_duration_hours("8h 30m"), 8.5)
        self.assertEqual(parse_duration_hours("0h 45m"), 0.75)
        job = parse_job_field("795 - CW8520 - Panorama Gardens")
        self.assertEqual(job["code"], "795")
        self.assertEqual(job["project_code"], "CW8520")
        self.assertEqual(job["sage_codes"], ["CW8520"])
        stat = parse_job_field("136 - Stat Holiday")
        self.assertEqual(stat["code"], "136")
        self.assertEqual(stat["project_code"], "")
        electrical = parse_job_field("562 - Electrical")
        self.assertEqual(electrical["project_code"], "")
        self.assertEqual(electrical["sage_codes"], [])
        self.assertEqual(compact_job_code("CW-8520"), "CW8520")

    def test_local_datetime_vancouver(self):
        dt = parse_local_datetime("2026-09-09 8:00 am")
        self.assertIsNotNone(dt)
        self.assertEqual(dt.hour, 8)
        self.assertEqual(dt.strftime("%Y-%m-%d"), "2026-09-09")
        self.assertIsNone(parse_local_datetime("N/A"))

    def test_unique_people_from_csv(self):
        csv_text = """Employee ID,Name,Group,In,Clock Out Time,Job,Duration
4,Alex Costelo,Steep Division,2026-09-09 8:00 am,2026-09-09 4:00 pm,0 - No Project Assigned,8h 0m
4,Alex Costelo,Steep Division,N/A,N/A,136 - Stat Holiday,8h 30m
300,"Agbunag, Reymund",Steep Division,2026-09-09 7:00 am,2026-09-09 3:30 pm,795 - CW8520 - Panorama,8h 30m
"""
        rows = parse_activity_csv(csv_text)
        self.assertEqual(len(rows), 3)
        people = unique_people(rows)
        self.assertEqual(len(people), 2)
        by_id = {p["vericlock_employee_id"]: p for p in people}
        self.assertEqual(by_id["4"]["row_count"], 2)
        self.assertEqual(by_id["300"]["first_name"], "Reymund")
        self.assertEqual(by_id["300"]["last_name"], "Agbunag")
        jobs = unique_jobs(rows)
        by_job = {j["vericlock_job_code"]: j for j in jobs}
        self.assertIn("795", by_job)
        self.assertIn("CW8520", by_job["795"]["sage_codes"])


class _FakeProject:
    def __init__(self, code: str, name: str, number: str = ""):
        self.id = uuid.uuid4()
        self.code = code
        self.name = name
        self.project_number = number


class TestVeriClockJobs(unittest.TestCase):
    def test_sage_code_in_label_matches_hub_project(self):
        project = _FakeProject("CW8520", "Panorama Gardens")
        by_code = {compact_job_code(project.code): project}
        job = parse_job_field("795 - CW8520 - Panorama Gardens")
        hit = resolve_job(job, by_code, {})
        self.assertTrue(hit["ok"])
        self.assertEqual(hit["kind"], "project")
        self.assertEqual(hit["project_id"], project.id)

    def test_hyphenated_hub_code_still_matches(self):
        project = _FakeProject("SD-8442", "Some Job", "709")
        by_code = {compact_job_code(project.code): project}
        job = parse_job_field("709 - SD8442 - Roof")
        hit = resolve_job(job, by_code, {})
        self.assertTrue(hit["ok"])
        self.assertEqual(hit["project_id"], project.id)

    def test_electrical_is_unmatched_until_mapped(self):
        job = parse_job_field("562 - Electrical")
        hit = resolve_job(job, {}, {})
        self.assertFalse(hit["ok"])
        self.assertEqual(hit["kind"], "unmatched")

    def test_predefined_stat_holiday_auto_matches(self):
        job = parse_job_field("136 - Stat Holiday")
        hit = resolve_job(job, {}, {})
        self.assertTrue(hit["ok"])
        self.assertEqual(hit["predefined_job_code"], "136")

    def test_saved_skip_does_not_import(self):
        class Saved:
            skip = True
            hub_project_id = None
            predefined_job_code = None
            vericlock_label = "562 - Electrical"

        hit = resolve_job(parse_job_field("562 - Electrical"), {}, {}, Saved())
        self.assertTrue(hit["skipped"])
        self.assertFalse(hit["ok"])


class TestVeriClockSageSkip(unittest.TestCase):
    def test_imported_row_stays_sent_when_hours_change(self):
        att = _att(source=SOURCE_VERICLOCK, sage_state="sent")
        refresh_sage_export_state(att, hours_changed=True)
        self.assertEqual(att.sage_state, "sent")
        self.assertFalse(att.sage_urgent)

    def test_vericlock_none_is_forced_sent_not_queued(self):
        att = _att(source=SOURCE_VERICLOCK, sage_state="none")
        refresh_sage_export_state(att)
        self.assertEqual(att.sage_state, "sent")


class TestVeriClockOverwrite(unittest.TestCase):
    def test_same_ref_skips_without_overwrite(self):
        att = _att(source=SOURCE_VERICLOCK, sage_state="sent")
        self.assertEqual(import_action_for_ref(att, overwrite=False), "skip")

    def test_same_ref_updates_vericlock_with_overwrite(self):
        att = _att(source=SOURCE_VERICLOCK, sage_state="sent")
        self.assertEqual(import_action_for_ref(att, overwrite=True), "update")

    def test_overwrite_does_not_touch_hub_punches(self):
        att = _att(source="app", sage_state="sent")
        self.assertEqual(import_action_for_ref(att, overwrite=True), "skip")

    def test_overwrite_applies_new_times_and_stays_sent(self):
        from datetime import datetime, timezone

        att = _att(source=SOURCE_VERICLOCK, sage_state="sent", sage_urgent=True)
        clock_in = datetime(2026, 9, 9, 15, 0, tzinfo=timezone.utc)
        clock_out = datetime(2026, 9, 9, 23, 30, tzinfo=timezone.utc)
        apply_vericlock_attendance(
            att,
            worker_id=att.worker_id,
            clock_in=clock_in,
            clock_out=clock_out,
            hours_only=False,
            declared=8.0,
            break_min=30,
            project_id=None,
            predefined="47",
            job_type="47",
            hours_marker=None,
            work_type_id=None,
            user_id=None,
            now=datetime.now(timezone.utc),
            ref="vc:4:20260909T1500:47",
            is_new=False,
        )
        self.assertEqual(att.clock_out_time, clock_out)
        self.assertEqual(att.predefined_job_code, "47")
        self.assertEqual(att.break_minutes, 30)
        self.assertEqual(att.source, SOURCE_VERICLOCK)
        self.assertEqual(att.sage_state, "sent")
        self.assertFalse(att.sage_urgent)


if __name__ == "__main__":
    unittest.main()
