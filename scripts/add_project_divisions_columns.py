"""
Script para adicionar as colunas parent_id em setting_items e project_division_ids em projects.
Execute este script para corrigir os problemas de colunas faltando.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables first
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")
    print("Continuing with environment variables...")
    pass

# Check database type before importing
database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
        sys.exit(1)

# Now import database components
try:
    from app.db import engine
    from sqlalchemy import text
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    print("Make sure you're running this script from the project root directory.")
    sys.exit(1)
except Exception as e:
    error_msg = str(e)
    if "psycopg2" in error_msg or "ModuleNotFoundError" in error_msg:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
    else:
        print(f"ERROR: Failed to initialize database connection: {e}")
        db_preview = database_url.split('@')[0] if '@' in database_url else database_url[:30]
        print(f"Database URL: {db_preview}...")
    sys.exit(1)


def add_columns():
    """Add parent_id to setting_items and project_division_ids to projects"""
    print("=" * 60)
    print("MK Hub - Adicionando colunas para project divisions")
    print("=" * 60)
    print()
    
    # Check database type
    if database_url.startswith("sqlite"):
        print("Detectado SQLite - usando migração SQLite")
        # SQLite doesn't support UUID, JSONB, or GIN indexes
        parent_id_sql = "ALTER TABLE setting_items ADD COLUMN parent_id TEXT"
        parent_id_index_sql = "CREATE INDEX IF NOT EXISTS idx_setting_items_parent_id ON setting_items(parent_id)"
        project_div_sql = "ALTER TABLE projects ADD COLUMN project_division_ids TEXT"
        project_div_index_sql = "CREATE INDEX IF NOT EXISTS idx_projects_project_division_ids ON projects(project_division_ids)"
    elif database_url.startswith("postgresql"):
        print("Detectado PostgreSQL - usando migração PostgreSQL")
        parent_id_sql = "ALTER TABLE setting_items ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES setting_items(id) ON DELETE CASCADE"
        parent_id_index_sql = "CREATE INDEX IF NOT EXISTS idx_setting_items_parent_id ON setting_items(parent_id)"
        project_div_sql = "ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_division_ids JSONB"
        project_div_index_sql = "CREATE INDEX IF NOT EXISTS idx_projects_project_division_ids ON projects USING GIN (project_division_ids)"
    else:
        print(f"ERROR: Tipo de banco de dados não suportado: {database_url[:20]}...")
        sys.exit(1)
    
    try:
        with engine.begin() as conn:
            # Add parent_id to setting_items
            print(f"Executando: {parent_id_sql}")
            conn.execute(text(parent_id_sql))
            print("[OK] Coluna parent_id adicionada a setting_items!")
            
            print(f"Executando: {parent_id_index_sql}")
            conn.execute(text(parent_id_index_sql))
            print("[OK] Índice para parent_id criado!")
            
            # Add project_division_ids to projects
            print(f"Executando: {project_div_sql}")
            conn.execute(text(project_div_sql))
            print("[OK] Coluna project_division_ids adicionada a projects!")
            
            print(f"Executando: {project_div_index_sql}")
            conn.execute(text(project_div_index_sql))
            print("[OK] Índice para project_division_ids criado!")
            
            # Verify columns were created
            if database_url.startswith("postgresql"):
                check_parent = """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'setting_items' AND column_name = 'parent_id'
                """
                check_project_div = """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'projects' AND column_name = 'project_division_ids'
                """
                
                result = conn.execute(text(check_parent))
                row = result.fetchone()
                if row:
                    print()
                    print("[OK] Verificação: Coluna parent_id existe em setting_items")
                    print(f"  - Tipo: {row[1]}")
                
                result = conn.execute(text(check_project_div))
                row = result.fetchone()
                if row:
                    print("[OK] Verificação: Coluna project_division_ids existe em projects")
                    print(f"  - Tipo: {row[1]}")
        
        print()
        print("=" * 60)
        print("[OK] Migração concluída com sucesso!")
        print("=" * 60)
        return True
        
    except Exception as e:
        error_msg = str(e)
        if "already exists" in error_msg or "duplicate column" in error_msg.lower():
            print()
            print("[INFO] As colunas já existem no banco de dados.")
            print("   Nenhuma ação necessária.")
            return True
        else:
            print()
            print("=" * 60)
            print("[ERRO] Erro ao executar migração:")
            print(f"   {error_msg}")
            print("=" * 60)
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = add_columns()
    sys.exit(0 if success else 1)

