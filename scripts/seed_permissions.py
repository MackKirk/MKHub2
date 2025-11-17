"""
Script para popular as permissões iniciais do sistema.
Execute este script após criar as tabelas para inicializar as permissões básicas.
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
    print("Continuing with default values...")

# Check database type before importing
database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
        print("\nAlternatively, if you want to use SQLite locally, set DATABASE_URL in .env to:")
        print("DATABASE_URL=sqlite:///./var/dev.db")
        sys.exit(1)

# Now import database components
try:
    from app.db import SessionLocal
    from app.models.models import PermissionCategory, PermissionDefinition
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    print("Make sure you're running this script from the project root directory.")
    sys.exit(1)
except Exception as e:
    error_msg = str(e)
    if "psycopg2" in error_msg or "ModuleNotFoundError" in error_msg:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
        print("\nAlternatively, if you want to use SQLite locally, set DATABASE_URL in .env to:")
        print("DATABASE_URL=sqlite:///./var/dev.db")
    else:
        print(f"ERROR: Failed to initialize database connection: {e}")
        print(f"Database URL: {database_url}")
    sys.exit(1)


def seed_permissions():
    """Seed initial permissions"""
    db = SessionLocal()
    
    try:
        # Verificar se já existem categorias
        existing_categories = db.query(PermissionCategory).count()
        if existing_categories > 0:
            print("Permissions already seeded. Skipping...")
            return
        
        # Definir categorias e permissões
        categories_data = [
            {
                "name": "profile",
                "label": "Perfil do Funcionário",
                "description": "Permissões relacionadas ao perfil pessoal e profissional do funcionário",
                "sort_index": 1,
                "permissions": [
                    {
                        "key": "profile:edit_personal",
                        "label": "Editar Informações Pessoais",
                        "description": "Permite editar informações pessoais (nome, telefone, endereço, etc.)",
                        "sort_index": 1,
                    },
                    {
                        "key": "profile:edit_work",
                        "label": "Editar Informações de Trabalho",
                        "description": "Permite editar informações de trabalho (cargo, divisão, gerente, etc.)",
                        "sort_index": 2,
                    },
                    {
                        "key": "profile:edit_photo",
                        "label": "Editar Foto de Perfil",
                        "description": "Permite alterar a foto de perfil",
                        "sort_index": 3,
                    },
                    {
                        "key": "profile:view_salary",
                        "label": "Visualizar Salário",
                        "description": "Permite visualizar informações de salário",
                        "sort_index": 4,
                    },
                ],
            },
            {
                "name": "equipment",
                "label": "Equipamentos e Ferramentas",
                "description": "Permissões relacionadas ao gerenciamento de equipamentos e ferramentas",
                "sort_index": 2,
                "permissions": [
                    {
                        "key": "equipment:view",
                        "label": "Visualizar Equipamentos",
                        "description": "Permite visualizar equipamentos atribuídos",
                        "sort_index": 1,
                    },
                    {
                        "key": "equipment:manage",
                        "label": "Administrar Equipamentos",
                        "description": "Permite atribuir, devolver e gerenciar equipamentos",
                        "sort_index": 2,
                    },
                ],
            },
            {
                "name": "salary",
                "label": "Salário e Remuneração",
                "description": "Permissões relacionadas a salário e histórico de remuneração",
                "sort_index": 3,
                "permissions": [
                    {
                        "key": "salary:view_history",
                        "label": "Visualizar Histórico de Salário",
                        "description": "Permite visualizar o histórico de mudanças de salário",
                        "sort_index": 1,
                    },
                    {
                        "key": "salary:change",
                        "label": "Alterar Salário",
                        "description": "Permite criar novas entradas no histórico de salário",
                        "sort_index": 2,
                    },
                ],
            },
            {
                "name": "loans",
                "label": "Empréstimos",
                "description": "Permissões relacionadas a empréstimos da empresa",
                "sort_index": 4,
                "permissions": [
                    {
                        "key": "loans:view",
                        "label": "Visualizar Empréstimos",
                        "description": "Permite visualizar empréstimos e pagamentos",
                        "sort_index": 1,
                    },
                    {
                        "key": "loans:manage",
                        "label": "Gerenciar Empréstimos",
                        "description": "Permite criar empréstimos e registrar pagamentos",
                        "sort_index": 2,
                    },
                ],
            },
            {
                "name": "notices",
                "label": "Ocorrências",
                "description": "Permissões relacionadas a ocorrências e notificações",
                "sort_index": 5,
                "permissions": [
                    {
                        "key": "notices:view",
                        "label": "Visualizar Ocorrências",
                        "description": "Permite visualizar ocorrências do funcionário",
                        "sort_index": 1,
                    },
                    {
                        "key": "notices:create",
                        "label": "Criar Ocorrências",
                        "description": "Permite criar novas ocorrências",
                        "sort_index": 2,
                    },
                ],
            },
            {
                "name": "fines_tickets",
                "label": "Multas e Tickets",
                "description": "Permissões relacionadas a multas e tickets",
                "sort_index": 6,
                "permissions": [
                    {
                        "key": "fines_tickets:view",
                        "label": "Visualizar Multas e Tickets",
                        "description": "Permite visualizar multas e tickets",
                        "sort_index": 1,
                    },
                    {
                        "key": "fines_tickets:manage",
                        "label": "Gerenciar Multas e Tickets",
                        "description": "Permite criar e atualizar multas e tickets",
                        "sort_index": 2,
                    },
                ],
            },
            {
                "name": "divisions",
                "label": "Divisões",
                "description": "Permissões relacionadas a divisões do funcionário",
                "sort_index": 7,
                "permissions": [
                    {
                        "key": "divisions:view",
                        "label": "Visualizar Divisões",
                        "description": "Permite visualizar divisões do funcionário",
                        "sort_index": 1,
                    },
                    {
                        "key": "divisions:manage",
                        "label": "Gerenciar Divisões",
                        "description": "Permite adicionar ou remover divisões do funcionário",
                        "sort_index": 2,
                    },
                ],
            },
        ]
        
        # Criar categorias e permissões
        for cat_data in categories_data:
            category = PermissionCategory(
                name=cat_data["name"],
                label=cat_data["label"],
                description=cat_data.get("description"),
                sort_index=cat_data["sort_index"],
            )
            db.add(category)
            db.flush()  # Para obter o ID da categoria
            
            for perm_data in cat_data["permissions"]:
                permission = PermissionDefinition(
                    category_id=category.id,
                    key=perm_data["key"],
                    label=perm_data["label"],
                    description=perm_data.get("description"),
                    sort_index=perm_data["sort_index"],
                )
                db.add(permission)
        
        db.commit()
        print(f"Successfully seeded {len(categories_data)} permission categories with their permissions.")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_permissions()

