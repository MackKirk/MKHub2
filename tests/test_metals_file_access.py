"""Metals users can read FileObjects still stamped with Hub client_id after migration."""
import sys
import types
import unittest
import uuid
from unittest.mock import MagicMock, patch

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

from app.services.file_access_control import (  # noqa: E402
    _metals_user_may_read_client_scoped_file,
    assert_can_read_file_object,
)


def _user_with_perms(**perms):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.roles = []
    user.permissions_override = perms
    return user


class _Q:
    """Tiny query chain: .filter(...).first() → value."""

    def __init__(self, value=None):
        self._value = value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._value


class TestMetalsFileAccess(unittest.TestCase):
    def test_quotes_reader_allowed_for_hub_stamped_fo(self):
        user = _user_with_perms(**{"sales:quotations:read": True})
        fo = MagicMock()
        fo.id = uuid.uuid4()
        hub_cid = uuid.uuid4()
        db = MagicMock()
        # MetalsClient / MetalsClientFile / map → miss; quotes fallback → True
        db.query.side_effect = lambda *_a, **_k: _Q(None)
        self.assertTrue(_metals_user_may_read_client_scoped_file(user, db, fo, hub_cid))

    def test_metals_files_reader_via_id_map(self):
        user = _user_with_perms(**{"metals:customers:read": True})
        fo = MagicMock()
        fo.id = uuid.uuid4()
        hub_cid = uuid.uuid4()
        calls = {"n": 0}

        def query(model, *args, **kwargs):
            calls["n"] += 1
            # 1 MetalsClient, 2 MetalsClientFile, 3 MetalsClientIdMap
            if calls["n"] >= 3:
                return _Q(object())
            return _Q(None)

        db = MagicMock()
        db.query.side_effect = query
        self.assertTrue(_metals_user_may_read_client_scoped_file(user, db, fo, hub_cid))

    def test_assert_allows_metals_user_when_fo_client_id_is_hub(self):
        user = _user_with_perms(
            **{"metals:customers:read": True, "sales:quotations:read": True}
        )
        hub_cid = uuid.uuid4()
        fo = MagicMock()
        fo.id = uuid.uuid4()
        fo.client_id = hub_cid
        fo.project_id = None
        fo.employee_id = None
        fo.key = f"org/2024/{hub_cid}/client-logo-derived/x.jpg"
        fo.created_by = None
        fo.source_ref = None
        fo.tags = None

        db = MagicMock()

        def query(model, *args, **kwargs):
            # Special-case early library / proposal checks → None
            return _Q(None)

        db.query.side_effect = query

        with patch(
            "app.services.file_access_control._resolve_file_scope_from_references",
            return_value=(None, hub_cid, None),
        ), patch(
            "app.services.file_access_control._metals_user_may_read_client_scoped_file",
            return_value=True,
        ), patch(
            "app.services.file_access_control._is_employee_profile_photo_file",
            return_value=False,
        ), patch(
            "app.services.file_access_control._is_community_post_media_file",
            return_value=False,
        ), patch(
            "app.services.file_access_control._is_own_employee_profile_document",
            return_value=False,
        ), patch(
            "app.services.file_access_control._is_training_course_material_blob",
            return_value=False,
        ), patch(
            "app.services.file_access_control._is_tutorial_media_blob",
            return_value=False,
        ), patch(
            "app.services.file_access_control._is_organization_logo_library_blob",
            return_value=False,
        ), patch(
            "app.services.file_access_control._is_certificate_background_library_blob",
            return_value=False,
        ), patch(
            "app.services.file_access_control._user_has_document_creator_api_read_permission",
            return_value=False,
        ):
            assert_can_read_file_object(user, db, fo)  # must not raise


if __name__ == "__main__":
    unittest.main()
