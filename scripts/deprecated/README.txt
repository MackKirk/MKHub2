DEPRECATED PATTERN — DO NOT RESTORE IN CODE

Historico (MKHub):
  Versoes antigas de scripts/seed_project_divisions.py apagavam todos os SettingItem
  da lista "project_divisions" e recriavam as divisoes. Isso gerava NOVOS UUIDs e
  quebrava project_division_ids em projetos, treinamentos, etc.

Padrao atual (unico suportado):
  scripts/seed_project_divisions.py faz UPSERT por (list_id, parent_id, label) e
  preserva os ids existentes.

Arquivos nesta pasta servem apenas como aviso/documentacao.
