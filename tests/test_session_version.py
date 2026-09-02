import unittest
from types import SimpleNamespace

from app.auth.security import access_session_is_current


class SessionVersionTests(unittest.TestCase):
    def test_missing_sv_matches_version_zero(self):
        user = SimpleNamespace(session_version=0)
        self.assertTrue(access_session_is_current(user, {"sub": "x"}))

    def test_mismatch_after_logout(self):
        user = SimpleNamespace(session_version=1)
        self.assertFalse(access_session_is_current(user, {"sv": 0}))
        self.assertTrue(access_session_is_current(user, {"sv": 1}))


if __name__ == "__main__":
    unittest.main()
