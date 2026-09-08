"""Tests for 15-minute clock rounding and payable minutes."""
import unittest
from datetime import datetime

from app.services.time_calculation import (
    elapsed_minutes,
    payable_minutes,
    round_clock_datetime,
)


class TestRoundClockDatetime(unittest.TestCase):
    def _dt(self, minute, hour=8):
        return datetime(2026, 9, 3, hour, minute, 7, 123000)

    def test_7_stays_00(self):
        out = round_clock_datetime(self._dt(7))
        self.assertEqual(out.minute, 0)
        self.assertEqual(out.second, 0)
        self.assertEqual(out.microsecond, 0)

    def test_8_goes_to_15(self):
        self.assertEqual(round_clock_datetime(self._dt(8)).minute, 15)

    def test_22_stays_15(self):
        self.assertEqual(round_clock_datetime(self._dt(22)).minute, 15)

    def test_23_goes_to_30(self):
        self.assertEqual(round_clock_datetime(self._dt(23)).minute, 30)

    def test_52_stays_45(self):
        self.assertEqual(round_clock_datetime(self._dt(52)).minute, 45)

    def test_53_rolls_to_next_hour(self):
        out = round_clock_datetime(self._dt(53, hour=8))
        self.assertEqual(out.hour, 9)
        self.assertEqual(out.minute, 0)

    def test_exact_slots_unchanged(self):
        for m in (0, 15, 30, 45):
            self.assertEqual(round_clock_datetime(self._dt(m)).minute, m)


class TestPayableMinutes(unittest.TestCase):
    def test_elapsed_minus_break(self):
        start = datetime(2026, 9, 3, 8, 0)
        end = datetime(2026, 9, 3, 17, 0)
        elapsed = elapsed_minutes(start, end)
        self.assertEqual(elapsed, 540)
        self.assertEqual(payable_minutes(elapsed=elapsed, break_minutes=30), 510)

    def test_hours_only_uses_declared(self):
        self.assertEqual(
            payable_minutes(
                elapsed=480,
                break_minutes=30,
                entry_kind="hours_only",
                declared_hours=6.5,
            ),
            390,
        )

    def test_missing_clock_out(self):
        self.assertIsNone(elapsed_minutes(datetime(2026, 9, 3, 8, 0), None))
        self.assertIsNone(payable_minutes(elapsed=None, break_minutes=0))


if __name__ == "__main__":
    unittest.main()
