from pathlib import Path
p = Path("docs/fieldwork_phrase_import_preview_roofing_verbiage.md")
extra = Path("var/_verbiage_rec_append.md")
p.write_text(p.read_text(encoding="utf-8") + "\n" + extra.read_text(encoding="utf-8"), encoding="utf-8")
print("done", p.stat().st_size)
