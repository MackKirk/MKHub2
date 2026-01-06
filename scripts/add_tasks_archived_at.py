"""
Script para adicionar a coluna archived_at à tabela tasks_v2.
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
print("Adicionando coluna archived_at à tabela tasks_v2")
print("=" * 60)
print()

try:
    with engine.begin() as conn:
        if database_url.startswith("postgresql"):
            sql = "ALTER TABLE tasks_v2 ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE"
            index_sql = "CREATE INDEX IF NOT EXISTS idx_tasks_v2_archived_at ON tasks_v2(archived_at)"
        else:
            sql = "ALTER TABLE tasks_v2 ADD COLUMN archived_at TIMESTAMP"
            index_sql = "CREATE INDEX IF NOT EXISTS idx_tasks_v2_archived_at ON tasks_v2(archived_at)"
        
        print(f"Executando: {sql}")
        conn.execute(text(sql))
        print("[OK] Coluna archived_at adicionada com sucesso!")
        
        print(f"Executando: {index_sql}")
        conn.execute(text(index_sql))
        print("[OK] Índice idx_tasks_v2_archived_at criado com sucesso!")
        
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
