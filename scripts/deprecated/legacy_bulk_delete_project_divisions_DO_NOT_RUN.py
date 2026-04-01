"""
DEPRECATED — NAO EXECUTE ESTE ARQUIVO

O padrao "apagar todos os itens de project_divisions e recriar" foi removido porque
alterava os UUIDs das divisoes e quebrava referencias em projetos e em outros modulos.

Use apenas:
  python scripts/seed_project_divisions.py

(Implementacao atual: upsert por label, ids preservados.)
"""
import sys

def main():
    print(
        "ERRO: Este padrao foi descontinuado propositalmente.\n"
        "Nao apague setting_items de project_divisions em massa.\n"
        "Execute: python scripts/seed_project_divisions.py"
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
