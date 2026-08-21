"""Auto-fill token substitution keeps empty placeholders."""
import sys
import types
import unittest

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


class TestDocumentCreatorTokens(unittest.TestCase):
    def test_empty_value_keeps_token(self):
        from app.routes.document_creator import _replace_tokens_in_text

        src = "Hello <Project Name> and <Employee Name>"
        out = _replace_tokens_in_text(src, {"project_name": "", "employee_name": ""})
        self.assertEqual(out, src)

    def test_nonempty_value_replaces_token(self):
        from app.routes.document_creator import _replace_tokens_in_text

        src = "Job: <Project Name>; <Employee Name>"
        out = _replace_tokens_in_text(src, {"project_name": "Roof Repair", "employee_name": ""})
        self.assertEqual(out, "Job: Roof Repair; <Employee Name>")

    def test_employee_address_skips_duplicate_locality(self):
        from types import SimpleNamespace
        from app.routes.document_creator import _format_employee_address

        ep = SimpleNamespace(
            address_line1="9552 198 St, Langley Twp, BC V1M 3CB",
            address_line2=None,
            city="Langley",
            province="British Columbia",
            postal_code="V1M 3C8",
        )
        self.assertEqual(
            _format_employee_address(ep),
            "9552 198 St, Langley Twp, BC V1M 3CB",
        )

    def test_employee_address_single_line_from_parts(self):
        from types import SimpleNamespace
        from app.routes.document_creator import _format_employee_address

        ep = SimpleNamespace(
            address_line1="9552 198 St",
            address_line2=None,
            city="Langley",
            province="BC",
            postal_code="V1M 3CB",
        )
        self.assertEqual(
            _format_employee_address(ep),
            "9552 198 St, Langley, BC, V1M 3CB",
        )
        self.assertNotIn("\n", _format_employee_address(ep))

    def test_hiring_date_token_replaces(self):
        from app.routes.document_creator import _replace_tokens_in_text

        src = "Start: <Employee Hiring Date>"
        out = _replace_tokens_in_text(src, {"employee_hiring_date": "March 1, 2024"})
        self.assertEqual(out, "Start: March 1, 2024")

    def test_format_employee_wage(self):
        from app.routes.document_creator import _format_employee_wage

        self.assertEqual(_format_employee_wage("25.50"), "$25.50")
        self.assertEqual(_format_employee_wage("$30 /hr"), "$30")
        self.assertEqual(_format_employee_wage("1,200.00 salary"), "$1,200.00")
        self.assertEqual(_format_employee_wage(""), "")

    def test_employee_wage_token_replaces(self):
        from app.routes.document_creator import _replace_tokens_in_text

        src = "Wage: <Employee Wage> legacy <Employee Salary>"
        out = _replace_tokens_in_text(src, {"employee_wage": "$42"})
        self.assertEqual(out, "Wage: $42 legacy $42")
