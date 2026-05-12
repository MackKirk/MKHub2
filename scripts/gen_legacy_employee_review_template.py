"""One-off: build form definition JSON matching legacy employee_answers.json (labels + types)."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

# Default: repo root relative
REPO = Path(__file__).resolve().parents[1]
LEGACY_JSON = Path.home() / "Desktop" / "employee_answers.json"
OUT = REPO / "app" / "data" / "employee_review_legacy_platform_template.definition.json"


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else LEGACY_JSON
    if not src.is_file():
        print(f"Missing {src} — pass path to employee_answers.json as argv[1]", file=sys.stderr)
        sys.exit(1)
    rows = json.loads(src.read_text(encoding="utf-8"))
    categories = [
        ("WORK STANDARDS", 6),
        ("BEHAVIOUR AND TEAMWORK", 6),
        ("GROWTH AND DEVELOPMENT", 6),
        ("SKILLS COMPENTANCY", 6),
        ("SAFETY", 7),
        ("RESPONSIBILTY", 6),
        ("COMPANY VEHICLE AND MACHINERY", 6),
        ("REFLECTION & PLANNING", 6),
    ]
    if sum(c[1] for c in categories) != len(rows):
        raise SystemExit(f"Row count mismatch: template {sum(c[1] for c in categories)} vs file {len(rows)}")

    def sec_uuid(title: str) -> str:
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, "mkhub-employee-review-legacy:" + title))

    sections: list[dict] = []
    pos = 0
    for sec_order, (title, count) in enumerate(categories):
        fields: list[dict] = []
        for _ in range(count):
            pos += 1
            r = rows[pos - 1]
            qt = str(r.get("type") or "").lower()
            if qt == "scale":
                ftype = "scale_1_5"
            elif qt == "yesno":
                ftype = "yes_no_na"
            else:
                ftype = "long_text"
            fk = f"er_e_{pos:03d}"
            fields.append(
                {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, fk)),
                    "key": fk,
                    "type": ftype,
                    "label": r["question"],
                    "order": len(fields),
                    "required": False,
                }
            )
        sections.append({"id": sec_uuid(title), "title": title, "order": sec_order, "fields": fields})

    definition = {
        "sections": sections,
        "signature_policy": {"worker": {"required": False, "mode": "drawn"}},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(definition, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(rows)} fields, {len(sections)} sections)")


if __name__ == "__main__":
    main()
