#!/usr/bin/env python3
"""
Script para adicionar a coluna project_division_ids à tabela employee_profiles.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
        sys.exit(1)

try:
    from app.db import engine
    from sqlalchemy import text
except Exception as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)

print("=" * 60)
print("Adicionando coluna project_division_ids à tabela employee_profiles")
print("=" * 60)
print()

try:
    with engine.begin() as conn:
        if database_url.startswith("postgresql"):
            # PostgreSQL: Use JSONB for better performance
            sql = "ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS project_division_ids JSONB"
        else:
            # SQLite: Use JSON (text)
            sql = "ALTER TABLE employee_profiles ADD COLUMN project_division_ids JSON"
        
        print(f"Executando: {sql}")
        conn.execute(text(sql))
        print("[OK] Coluna project_division_ids adicionada com sucesso!")
        
        print()
        print("=" * 60)
        print("Migration concluída com sucesso!")
        print("=" * 60)
        
except Exception as e:
    print()
    print("=" * 60)
    print(f"ERRO: Falha ao executar migration: {e}")
    print("=" * 60)
    sys.exit(1)
