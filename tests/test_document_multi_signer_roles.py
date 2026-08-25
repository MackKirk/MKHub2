"""Free-form signers: extract, synthesize, assignments, filtering, token by label."""
import unittest
import uuid


class TestFreeFormSignerRoles(unittest.TestCase):
    def test_extract_emits_role_uuid_assignee(self):
        from app.document_creator.signature_fields import build_signature_template_payload

        role_id = str(uuid.uuid4())
        atom_id = str(uuid.uuid4())
        pages = [
            {
                "elements": [
                    {
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "content": "\ufffc",
                        "x_pct": 10,
                        "y_pct": 20,
                        "width_pct": 80,
                        "height_pct": 15,
                        "fontSize": 12,
                        "richLines": [
                            [
                                {
                                    "text": "\ufffc",
                                    "kind": "signature",
                                    "atomId": atom_id,
                                    "atomWidthPx": 200,
                                    "atomHeightPx": 48,
                                    "assignee": role_id,
                                    "required": True,
                                }
                            ]
                        ],
                    },
                ],
            }
        ]
        raw = build_signature_template_payload(pages)
        fields = raw["fields"]
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["assignee"], role_id)

    def test_legacy_user_and_employee_normalize_to_stable_ids(self):
        from app.services.document_signer_roles import (
            LEGACY_STABLE_IDS,
            normalize_field_assignee,
            synthesize_roles_from_assignees,
            ensure_document_signer_roles,
        )

        self.assertEqual(normalize_field_assignee("user"), LEGACY_STABLE_IDS["company"])
        self.assertEqual(normalize_field_assignee("employee"), LEGACY_STABLE_IDS["employee"])
        roles = synthesize_roles_from_assignees(["employee", "user", "other"])
        ids = {r["id"] for r in roles}
        self.assertIn(LEGACY_STABLE_IDS["employee"], ids)
        self.assertIn(LEGACY_STABLE_IDS["company"], ids)
        self.assertIn(LEGACY_STABLE_IDS["other"], ids)
        emp = next(r for r in roles if r["id"] == LEGACY_STABLE_IDS["employee"])
        self.assertTrue(emp["fillsEmployeeTokens"])

        pages = [
            {
                "elements": [
                    {
                        "id": "i1",
                        "type": "initials",
                        "assignee": "company",
                        "x_pct": 1,
                        "y_pct": 1,
                        "width_pct": 10,
                        "height_pct": 5,
                    }
                ]
            }
        ]
        ensured = ensure_document_signer_roles(None, pages)
        self.assertTrue(any(r["id"] == LEGACY_STABLE_IDS["company"] for r in ensured))
        # Employee is always present even when only company fields exist on the page.
        self.assertTrue(any(r["id"] == LEGACY_STABLE_IDS["employee"] for r in ensured))

    def test_ensure_always_includes_employee_and_company(self):
        from app.services.document_signer_roles import (
            LEGACY_STABLE_IDS,
            default_signer_roles,
            ensure_document_signer_roles,
        )

        defaults = default_signer_roles()
        self.assertEqual(
            {r["id"] for r in defaults},
            {LEGACY_STABLE_IDS["employee"], LEGACY_STABLE_IDS["company"]},
        )
        empty_pages_roles = ensure_document_signer_roles(None, [{"elements": []}])
        ids = {r["id"] for r in empty_pages_roles}
        self.assertIn(LEGACY_STABLE_IDS["employee"], ids)
        self.assertIn(LEGACY_STABLE_IDS["company"], ids)
        custom = ensure_document_signer_roles(
            [{"id": str(uuid.uuid4()), "label": "Vendor", "sortOrder": 0, "fillsEmployeeTokens": False}],
            None,
        )
        labels = {str(r["label"]).strip().lower() for r in custom}
        self.assertIn("employee", labels)
        self.assertIn("company", labels)
        self.assertIn("vendor", labels)

    def test_order_role_ids_follows_sort_order(self):
        from app.services.document_signer_roles import order_role_ids_present

        r1, r2, r3 = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        roles = [
            {"id": r2, "label": "B", "sortOrder": 1, "fillsEmployeeTokens": False},
            {"id": r1, "label": "A", "sortOrder": 0, "fillsEmployeeTokens": True},
            {"id": r3, "label": "C", "sortOrder": 2, "fillsEmployeeTokens": False},
        ]
        ordered = order_role_ids_present(roles, {r3, r1})
        self.assertEqual(ordered, [r1, r3])

    def test_parse_assignments_by_role_id(self):
        from fastapi import HTTPException
        from app.routes.document_signature_requests import _parse_assignments

        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        ua, ub = uuid.uuid4(), uuid.uuid4()
        out = _parse_assignments(
            {"assignments": {a: str(ua), b: str(ub)}},
            [a, b],
        )
        self.assertEqual(out[a], ua)
        with self.assertRaises(HTTPException):
            _parse_assignments({"assignments": {a: str(ua)}}, [a, b])

    def test_fields_for_signer_filters_by_role_id(self):
        from app.routes.document_signature_requests import _fields_for_signer

        r1, r2 = str(uuid.uuid4()), str(uuid.uuid4())
        tmpl = {
            "fields": [
                {"id": "1", "assignee": r1, "type": "signature"},
                {"id": "2", "assignee": r1, "type": "date"},
                {"id": "3", "assignee": r2, "type": "initials"},
            ]
        }
        mine = _fields_for_signer(tmpl, r1)
        self.assertEqual({f["id"] for f in mine}, {"1", "2"})
        rejected = [k for k in ("1", "3") if k not in {str(f["id"]) for f in mine}]
        self.assertEqual(rejected, ["3"])

    def test_employee_token_user_from_flag(self):
        from app.services.document_signer_roles import employee_token_user_from_assignments

        r1, r2 = str(uuid.uuid4()), str(uuid.uuid4())
        u1, u2 = uuid.uuid4(), uuid.uuid4()
        roles = [
            {"id": r1, "label": "A", "sortOrder": 0, "fillsEmployeeTokens": False},
            {"id": r2, "label": "Emp", "sortOrder": 1, "fillsEmployeeTokens": True},
        ]
        self.assertEqual(
            employee_token_user_from_assignments(roles, {r1: u1, r2: u2}),
            u2,
        )
        self.assertIsNone(
            employee_token_user_from_assignments(
                [{"id": r1, "label": "A", "sortOrder": 0, "fillsEmployeeTokens": False}],
                {r1: u1},
            )
        )

    def test_employee_token_user_from_label_employee(self):
        from app.services.document_signer_roles import employee_token_user_from_assignments

        r1, r2 = str(uuid.uuid4()), str(uuid.uuid4())
        u1, u2 = uuid.uuid4(), uuid.uuid4()
        roles = [
            {"id": r1, "label": "Owner", "sortOrder": 0, "fillsEmployeeTokens": False},
            {"id": r2, "label": "Employee", "sortOrder": 1, "fillsEmployeeTokens": False},
        ]
        self.assertEqual(
            employee_token_user_from_assignments(roles, {r1: u1, r2: u2}),
            u2,
        )


if __name__ == "__main__":
    unittest.main()
