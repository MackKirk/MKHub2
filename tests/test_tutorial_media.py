from app.services.tutorial_content import merge_tutorial_sections
from app.services.tutorial_media import KNOWN_SLOTS, is_known_slot
from app.services.tutorial_seeds import get_seed_section, get_seed_sections


def test_opportunities_seed_media_slots():
    assert "opportunities.list" in KNOWN_SLOTS
    assert KNOWN_SLOTS["opportunities.list"] == [
        "create",
        "fill-record",
        "work",
        "work-notes",
        "work-dispatch",
        "work-timesheet",
        "work-files",
        "work-documents",
        "work-proposal",
        "work-pricing",
        "work-costs",
        "convert",
    ]
    assert is_known_slot("opportunities.list", "create")
    assert is_known_slot("opportunities.list", "fill-record")
    assert not is_known_slot("opportunities.list", "what-it-is")
    assert not is_known_slot("opportunities.list", "status")
    assert not is_known_slot("opportunities.list", "also-useful")
    assert not is_known_slot("unknown.tutorial", "create")


def test_opportunities_seed_section_order():
    sections = get_seed_sections("opportunities.list")
    assert sections is not None
    ids = [s.id for s in sections]
    assert ids == [
        "what-it-is",
        "create",
        "fill-record",
        "work",
        "work-notes",
        "work-dispatch",
        "work-timesheet",
        "work-files",
        "work-documents",
        "work-proposal",
        "work-pricing",
        "work-costs",
        "status",
        "convert",
        "also-useful",
    ]
    create = get_seed_section("opportunities.list", "create")
    assert create is not None
    assert create.allows_media is True
    assert "New Opportunity" in create.body_md


class _EmptyQuery:
    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return []


class _FakeDb:
    def query(self, *args, **kwargs):
        return _EmptyQuery()


def test_merge_without_overrides_returns_seed():
    merged = merge_tutorial_sections(_FakeDb(), "opportunities.list")
    assert [s["id"] for s in merged] == [
        "what-it-is",
        "create",
        "fill-record",
        "work",
        "work-notes",
        "work-dispatch",
        "work-timesheet",
        "work-files",
        "work-documents",
        "work-proposal",
        "work-pricing",
        "work-costs",
        "status",
        "convert",
        "also-useful",
    ]
    assert merged[1]["allows_media"] is True
    assert merged[0]["is_overridden"] is False


def test_list_hidden_and_unhide_roundtrip():
    from datetime import datetime, timezone
    from app.models.models import TutorialSection
    from app.services.tutorial_content import list_hidden_sections, merge_tutorial_sections, unhide_section

    class _User:
        id = None

    hidden_row = TutorialSection(
        tutorial_id="opportunities.list",
        section_id="what-it-is",
        sort_order=10,
        title="What an Opportunity is",
        body_md="hidden body",
        allows_media=False,
        origin="seed",
        hidden=True,
        updated_by=None,
        updated_at=datetime.now(timezone.utc),
    )

    class _Query:
        def __init__(self, rows):
            self._rows = rows

        def filter(self, *args, **kwargs):
            return self

        def all(self):
            return list(self._rows)

        def first(self):
            return self._rows[0] if self._rows else None

    class _Db:
        def __init__(self):
            self.rows = [hidden_row]

        def query(self, *args, **kwargs):
            # list_hidden / unhide / merge each query TutorialSection
            if args and args[0] is TutorialSection:
                # merge sees all rows; filter hidden in merge logic
                return _Query(self.rows)
            return _Query(self.rows)

        def commit(self):
            return None

    db = _Db()
    hidden = list_hidden_sections(db, "opportunities.list")
    assert any(h["id"] == "what-it-is" for h in hidden)
    merged_hidden = merge_tutorial_sections(db, "opportunities.list")
    assert "what-it-is" not in [s["id"] for s in merged_hidden]

    restored = unhide_section(db, "opportunities.list", "what-it-is", _User())
    assert restored["id"] == "what-it-is"
    assert hidden_row.hidden is False
    merged = merge_tutorial_sections(db, "opportunities.list")
    assert "what-it-is" in [s["id"] for s in merged]


def test_media_items_cap_reorder_delete_and_legacy_copy():
    import uuid
    from types import SimpleNamespace

    from app.models.models import TutorialMediaItem, TutorialMediaSlot
    from app.services import tutorial_media_items as items

    class DB:
        def __init__(self):
            self.items = []
            self.slots = []
            self.files = {}
            self.kind = "items"

        def query(self, *models):
            first = models[0]
            cls = getattr(first, "class_", first)
            name = getattr(cls, "__name__", "")
            if name == "TutorialMediaSlot":
                self.kind = "slots"
            elif name == "FileObject":
                self.kind = "file"
            elif len(models) >= 2:
                self.kind = "join"
            else:
                self.kind = "items"
            return self

        def join(self, *args, **kwargs):
            return self

        def filter(self, *args, **kwargs):
            return self

        def order_by(self, *args, **kwargs):
            return self

        def _ordered_items(self):
            return sorted(self.items, key=lambda row: (row.sort_order, str(row.id)))

        def all(self):
            if self.kind == "slots":
                return list(self.slots)
            ordered = self._ordered_items()
            if self.kind == "join":
                return [(row, self.files[row.file_object_id]) for row in ordered]
            return ordered

        def first(self):
            if self.kind == "file":
                return next(iter(self.files.values()), None)
            if self.kind == "items":
                return self.items[0] if self.items else None
            rows = self.all()
            return rows[0] if rows else None

        def add(self, row):
            if isinstance(row, TutorialMediaItem):
                if getattr(row, "id", None) is None:
                    row.id = uuid.uuid4()
                self.items.append(row)
            else:
                self.slots.append(row)

        def delete(self, row=None, synchronize_session=None):
            if row is None or not hasattr(row, "tutorial_id"):
                if self.kind == "items":
                    self.items.clear()
                return 0
            if row in self.items:
                self.items.remove(row)
            if row in self.slots:
                self.slots.remove(row)
            return None

        def commit(self):
            return None

        def refresh(self, row):
            if getattr(row, "id", None) is None:
                row.id = uuid.uuid4()

    user = SimpleNamespace(id=uuid.uuid4())
    db = DB()
    fid = uuid.uuid4()
    db.files[fid] = SimpleNamespace(id=fid, content_type="image/png")

    for i in range(6):
        items.append_item(
            db,
            tutorial_id="t",
            section_id="s",
            file_object_id=fid,
            caption=f"c{i}",
            user=user,
        )
    try:
        items.append_item(
            db,
            tutorial_id="t",
            section_id="s",
            file_object_id=fid,
            caption=None,
            user=user,
        )
        raise AssertionError("expected max_items")
    except ValueError as exc:
        assert str(exc) == "max_items"

    ids = [str(row.id) for row in db.items]
    assert len(ids) == 6
    flipped = list(reversed(ids))
    ordered = items.reorder_items(db, "t", "s", flipped, user)
    assert [row["id"] for row in ordered] == flipped

    removed = db.items[0]
    items.delete_item(db, "t", "s", removed.id)
    assert len(db.items) == 5
    assert removed not in db.items

    db2 = DB()
    slot_file = uuid.uuid4()
    db2.files[slot_file] = SimpleNamespace(id=slot_file, content_type="image/webp")
    db2.slots.append(
        TutorialMediaSlot(
            tutorial_id="opportunities.list",
            section_id="create",
            file_object_id=slot_file,
            updated_by=user.id,
        )
    )
    assert items.copy_legacy_slots(db2) == 1
    assert len(db2.items) == 1
    assert db2.items[0].file_object_id == slot_file
    listed = items.list_items(db2, "opportunities.list", "create")
    assert len(listed) == 1
    assert listed[0]["file_id"] == str(slot_file)
    assert items.copy_legacy_slots(db2) == 0


def test_clamp_tutorial_frame():
    from app.services.tutorial_media_items import clamp_frame

    assert clamp_frame(-10, 140, 0.05) == (0.0, 100.0, 0.1)
    assert clamp_frame(50, 0, 9) == (50.0, 0.0, 3.0)
    assert clamp_frame(None, None, None) == (50.0, 0.0, 1.0)
