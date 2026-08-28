"""Seed SettingLists for the Properties module."""
import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem


LISTS = {
    "property_types": ["office", "yard", "warehouse", "residential", "investment", "other"],
    "property_permit_stages": [
        "identified",
        "applying",
        "under_review",
        "conditions",
        "issued",
        "closed",
    ],
    "property_permit_types": [
        "building",
        "electrical",
        "plumbing",
        "fire",
        "occupancy",
        "environmental",
        "other",
    ],
    "property_responsibility_roles": [
        "electrical",
        "hvac",
        "roof",
        "security",
        "landscaping",
        "property_manager",
        "broker",
        "other",
    ],
    "property_insurance_types": ["property", "liability", "umbrella", "flood", "other"],
    "property_lease_renewal_types": ["fixed", "month_to_month", "auto_renew", "none"],
}


def seed_property_setting_lists():
    db = SessionLocal()
    try:
        for list_name, values in LISTS.items():
            sl = db.query(SettingList).filter(SettingList.name == list_name).first()
            if not sl:
                sl = SettingList(name=list_name)
                db.add(sl)
                db.flush()
            existing = {item.value or item.label for item in db.query(SettingItem).filter(SettingItem.list_id == sl.id).all()}
            for i, val in enumerate(values):
                if val in existing:
                    continue
                db.add(
                    SettingItem(
                        id=uuid.uuid4(),
                        list_id=sl.id,
                        label=val.replace("_", " ").title(),
                        value=val,
                        sort_index=i,
                    )
                )
        db.commit()
        print("Property setting lists seeded.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_property_setting_lists()
