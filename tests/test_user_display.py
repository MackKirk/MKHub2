import unittest

from app.services.user_display import user_search_label


class UserSearchLabelTests(unittest.TestCase):
    def test_preferred_with_legal_name_when_they_differ(self):
        self.assertEqual(
            user_search_label(preferred_name="Raph", first_name="Raphael", last_name="Coelho"),
            "Raph (Raphael Coelho)",
        )

    def test_skips_parentheses_when_preferred_matches_legal(self):
        self.assertEqual(
            user_search_label(preferred_name="Raphael Coelho", first_name="Raphael", last_name="Coelho"),
            "Raphael Coelho",
        )

    def test_legal_name_when_preferred_is_blank(self):
        self.assertEqual(
            user_search_label(preferred_name="  ", first_name="Raphael", last_name="Coelho"),
            "Raphael Coelho",
        )


if __name__ == "__main__":
    unittest.main()
