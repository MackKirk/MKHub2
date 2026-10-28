"""Unit tests for portal owner|awarded project visibility."""
from __future__ import annotations

import uuid

from app.services.portal_hub_project_access import (
    membership_client_for_access,
    resolve_participation,
)


class _P:
    def __init__(self, client_id=None, awarded=None, awarded_legacy=None, related=None):
        self.client_id = client_id
        self.awarded_related_client_ids = awarded
        self.awarded_related_client_id = awarded_legacy
        self.related_client_ids = related


def test_owner_participation():
    owner = uuid.uuid4()
    other = uuid.uuid4()
    p = _P(client_id=owner, awarded=[str(other)])
    assert resolve_participation(p, [owner]) == "owner"
    assert membership_client_for_access(p, [owner]) == owner


def test_awarded_participation():
    owner = uuid.uuid4()
    alfa = uuid.uuid4()
    p = _P(client_id=owner, awarded=[str(alfa)])
    assert resolve_participation(p, [alfa]) == "awarded"
    assert membership_client_for_access(p, [alfa]) == alfa


def test_other_awarded_gc_no_access():
    owner = uuid.uuid4()
    alfa = uuid.uuid4()
    beta = uuid.uuid4()
    p = _P(client_id=owner, awarded=[str(beta)])
    assert resolve_participation(p, [alfa]) is None
    assert membership_client_for_access(p, [alfa]) is None


def test_related_only_no_access():
    owner = uuid.uuid4()
    related = uuid.uuid4()
    p = _P(client_id=owner, related=[str(related)], awarded=[])
    assert resolve_participation(p, [related]) is None


def test_owner_preferred_over_awarded_same_client():
    """If somehow same client is both, report owner."""
    cid = uuid.uuid4()
    p = _P(client_id=cid, awarded=[str(cid)])
    assert resolve_participation(p, [cid]) == "owner"
