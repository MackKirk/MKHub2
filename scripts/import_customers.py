"""
Script para importar clientes de um arquivo CSV.

Mapeia os campos da planilha para os campos existentes no modelo Client.
Campos que não existem no modelo são ignorados.

Uso:
    python scripts/import_customers.py <caminho_do_csv>
    
Formato esperado do CSV:
    - COMPANY NAME (obrigatório)
    - TYPE
    - SPECIALTY
    - OFFICE NAME
    - STREET1
    - CITY
    - STATE
    - ZIPCODE
    - PHONE1 A
    - PHONE1 #
    - PHONE2 A
    - PHONE2 #
    - COMPANY NOTES
"""
import sys
import os
import csv
import uuid
import re

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables first
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

# Check database type before importing
database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        sys.exit(1)

try:
    from app.db import SessionLocal
    from app.models.models import Client, ClientContact
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


def clean_phone(phone_a: str, phone_num: str) -> str:
    """Combina PHONE1 A e PHONE1 # em um número de telefone completo"""
    phone_a = (phone_a or "").strip()
    phone_num = (phone_num or "").strip()
    
    # Remove espaços e caracteres especiais
    phone_a = re.sub(r'[^\d]', '', phone_a)
    phone_num = re.sub(r'[^\d]', '', phone_num)
    
    # Combina os dois
    full_phone = phone_a + phone_num
    
    # Se tiver pelo menos 10 dígitos, formata
    if len(full_phone) >= 10:
        # Formato: (XXX) XXX-XXXX ou similar
        if len(full_phone) == 10:
            return f"({full_phone[:3]}) {full_phone[3:6]}-{full_phone[6:]}"
        elif len(full_phone) == 11 and full_phone[0] == '1':
            # Remove leading 1 for US/Canada
            return f"({full_phone[1:4]}) {full_phone[4:7]}-{full_phone[7:]}"
        else:
            return full_phone
    
    return full_phone if full_phone else None


def normalize_field(value: str) -> str:
    """Normaliza um campo de string, removendo espaços extras"""
    if not value:
        return None
    value = str(value).strip()
    return value if value else None


def import_customers(csv_path: str, dry_run: bool = False):
    """Importa clientes de um arquivo CSV"""
    
    if not os.path.exists(csv_path):
        print(f"ERROR: Arquivo não encontrado: {csv_path}")
        sys.exit(1)
    
    db = SessionLocal()
    created_count = 0
    skipped_count = 0
    error_count = 0
    
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            # Tenta detectar o delimitador, mas usa vírgula como padrão
            try:
                sample = f.read(1024)
                f.seek(0)
                sniffer = csv.Sniffer()
                delimiter = sniffer.sniff(sample).delimiter
            except:
                delimiter = ','
            
            # Usa csv.QUOTE_MINIMAL para lidar com campos que contêm quebras de linha
            reader = csv.DictReader(f, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL)
            
            # Normaliza os nomes das colunas (remove espaços extras, converte para maiúsculas)
            if reader.fieldnames:
                fieldnames = [name.strip().upper() for name in reader.fieldnames]
                reader.fieldnames = fieldnames
            
            print(f"Colunas encontradas: {', '.join(fieldnames)}")
            print(f"\n{'[DRY RUN] ' if dry_run else ''}Iniciando importação...\n")
            
            for row_num, row in enumerate(reader, start=2):  # Começa em 2 porque linha 1 é header
                try:
                    # Mapeia os campos
                    company_name = normalize_field(row.get('COMPANY NAME') or row.get('COMPANYNAME'))
                    
                    if not company_name:
                        print(f"Linha {row_num}: Pulando - COMPANY NAME vazio")
                        skipped_count += 1
                        continue
                    
                    # Verifica se ja existe um cliente com esse nome
                    existing = db.query(Client).filter(Client.name == company_name).first()
                    if existing:
                        print(f"Linha {row_num}: Cliente '{company_name}' ja existe, pulando...")
                        skipped_count += 1
                        continue
                    
                    # Prepara os dados do cliente
                    client_data = {
                        'name': company_name,
                        'display_name': company_name,  # Usa o mesmo nome como display_name
                        'client_type': normalize_field(row.get('TYPE')),
                        'description': normalize_field(row.get('SPECIALTY') or row.get('COMPANY NOTES')),
                        'address_line1': normalize_field(row.get('STREET1') or row.get('STREET')),
                        'city': normalize_field(row.get('CITY')),
                        'province': normalize_field(row.get('STATE')),
                        'postal_code': normalize_field(row.get('ZIPCODE') or row.get('POSTAL CODE')),
                    }
                    
                    # Remove campos None
                    client_data = {k: v for k, v in client_data.items() if v is not None}
                    
                    # Gera um código único baseado no nome
                    base_code = company_name.lower().replace(" ", "-")[:20]
                    code = base_code
                    i = 1
                    while db.query(Client).filter(Client.code == code).first():
                        code = f"{base_code}-{i}"
                        i += 1
                    client_data['code'] = code
                    
                    if not dry_run:
                        # Cria o cliente
                        client = Client(**client_data)
                        db.add(client)
                        db.commit()
                        db.refresh(client)
                        
                        # Cria contatos para os telefones, se existirem
                        # Tenta diferentes variações dos nomes das colunas de telefone
                        phone1_area = row.get('PHONE1 AREACODE') or row.get('PHONE1 A') or row.get('PHONE1A') or row.get('PHONE1 AREA CODE')
                        phone1_num = row.get('PHONE1 #') or row.get('PHONE1#') or row.get('PHONE1') or row.get('PHONE1 NUMBER')
                        phone1 = clean_phone(phone1_area, phone1_num)
                        
                        phone2_area = row.get('PHONE2 AREACODE') or row.get('PHONE2 A') or row.get('PHONE2A') or row.get('PHONE2 AREA CODE')
                        phone2_num = row.get('PHONE2 #') or row.get('PHONE2#') or row.get('PHONE2') or row.get('PHONE2 NUMBER')
                        phone2 = clean_phone(phone2_area, phone2_num)
                        
                        # Cria primeiro contato (telefone principal)
                        if phone1:
                            contact1 = ClientContact(
                                client_id=client.id,
                                name=company_name,  # Usa o nome da empresa como nome do contato
                                phone=phone1,
                                is_primary=True,
                                sort_index=0
                            )
                            db.add(contact1)
                        
                        # Cria segundo contato (telefone secundário), se existir
                        if phone2:
                            contact2 = ClientContact(
                                client_id=client.id,
                                name=f"{company_name} (Secondary)",
                                phone=phone2,
                                is_primary=False,
                                sort_index=1
                            )
                            db.add(contact2)
                        
                        db.commit()
                        created_count += 1
                        print(f"Linha {row_num}: [OK] Cliente '{company_name}' criado (codigo: {code})")
                    else:
                        created_count += 1
                        print(f"Linha {row_num}: [DRY RUN] Cliente '{company_name}' seria criado (codigo: {code})")
                        print(f"         Dados: {client_data}")
                
                except Exception as e:
                    error_count += 1
                    print(f"Linha {row_num}: [ERRO] Erro ao processar: {e}")
                    if not dry_run:
                        db.rollback()
        
        print(f"\n{'='*60}")
        print(f"Importacao concluida!")
        print(f"  Criados: {created_count}")
        print(f"  Pulados: {skipped_count}")
        print(f"  Erros: {error_count}")
        print(f"{'='*60}")
    
    except Exception as e:
        print(f"ERROR: Erro ao ler arquivo CSV: {e}")
        if not dry_run:
            db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/import_customers.py <caminho_do_csv> [--dry-run]")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv or "-d" in sys.argv
    
    import_customers(csv_path, dry_run=dry_run)

