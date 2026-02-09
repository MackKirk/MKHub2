"""
Seed one default document template for the Document Creator (no background image).
Run after create_document_creator_tables.sql.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

try:
    from app.db import SessionLocal
    from app.models.models import DocumentTemplate
except ImportError as e:
    print(f"ERROR: {e}")
    sys.exit(1)


def seed():
    db = SessionLocal()
    try:
        existing = db.query(DocumentTemplate).first()
        if existing:
            print("Document templates already exist, skipping seed.")
            return
        t = DocumentTemplate(
            name="Capa padrão",
            description="Capa simples com título e subtítulo",
            background_file_id=None,
            areas_definition=[
                {"id": "title", "type": "title", "label": "Título", "x_pct": 10, "y_pct": 70, "width_pct": 80, "height_pct": 8, "font_size": 22},
                {"id": "subtitle", "type": "text", "label": "Subtítulo", "x_pct": 10, "y_pct": 58, "width_pct": 80, "height_pct": 6, "font_size": 14},
                {"id": "date", "type": "text", "label": "Data", "x_pct": 10, "y_pct": 15, "width_pct": 40, "height_pct": 4, "font_size": 11},
            ],
        )
        db.add(t)
        db.commit()
        print("Created default template 'Capa padrão'.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
