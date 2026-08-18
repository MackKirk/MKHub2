"""Login throttle lock steps and cooldown."""
import unittest

from app.auth.login_throttle import (
    enforce_login_allowed,
    record_login_failure,
    record_login_success,
    reset_login_throttle_state,
)
from fastapi import HTTPException


class TestLoginThrottle(unittest.TestCase):
    def setUp(self):
        reset_login_throttle_state()

    def tearDown(self):
        reset_login_throttle_state()

    def test_three_failures_lock_for_ten_seconds(self):
        now = 1_000.0
        self.assertIsNone(record_login_failure("1.1.1.1", "Ada", now=now))
        self.assertIsNone(record_login_failure("1.1.1.1", "Ada", now=now + 1))
        self.assertEqual(record_login_failure("1.1.1.1", "Ada", now=now + 2), 10)
        with self.assertRaises(HTTPException) as ctx:
            enforce_login_allowed("1.1.1.1", "ada", now=now + 5)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Try again in", ctx.exception.detail)
        self.assertEqual(ctx.exception.headers["Retry-After"], "8")

    def test_lock_expires_then_allows_another_try(self):
        now = 2_000.0
        for i in range(3):
            record_login_failure("2.2.2.2", "bob", now=now + i)
        enforce_login_allowed("2.2.2.2", "bob", now=now + 12)

    def test_success_clears_failures(self):
        now = 3_000.0
        record_login_failure("3.3.3.3", "cara", now=now)
        record_login_failure("3.3.3.3", "cara", now=now + 1)
        record_login_success("3.3.3.3", "cara")
        record_login_failure("3.3.3.3", "cara", now=now + 2)
        enforce_login_allowed("3.3.3.3", "cara", now=now + 3)

    def test_identifier_is_case_insensitive(self):
        now = 4_000.0
        record_login_failure("4.4.4.4", "Dana", now=now)
        record_login_failure("4.4.4.4", "DANA", now=now + 1)
        self.assertEqual(record_login_failure("4.4.4.4", "dana", now=now + 2), 10)
