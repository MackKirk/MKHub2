"""Quick script to check if project divisions exist"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem

db = SessionLocal()
try:
    lst = db.query(SettingList).filter(SettingList.name == 'project_divisions').first()
    print(f'SettingList encontrada: {lst is not None}')
    if lst:
        print(f'SettingList ID: {lst.id}')
        items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()
        print(f'Total de items: {len(items)}')
        main = [i for i in items if not i.parent_id]
        print(f'Divisões principais: {len(main)}')
        for m in main:
            print(f'  - {m.label} (id: {m.id})')
            subs = [i for i in items if i.parent_id == m.id]
            if subs:
                print(f'    Subdivisões: {len(subs)}')
                for s in subs[:3]:
                    print(f'      • {s.label}')
    else:
        print('SettingList "project_divisions" não encontrada!')
finally:
    db.close()

