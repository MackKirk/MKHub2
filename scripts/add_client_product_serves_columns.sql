-- Product scope flags for Hub vs Mack Kirk Metals customers.
-- Non-destructive: adds columns only; existing rows backfilled to Hub-only.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS serves_hub BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS serves_metals BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE clients
SET serves_hub = TRUE
WHERE serves_hub IS DISTINCT FROM TRUE;

UPDATE clients
SET serves_metals = FALSE
WHERE serves_metals IS DISTINCT FROM FALSE;

CREATE INDEX IF NOT EXISTS idx_clients_serves_hub ON clients (serves_hub) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_serves_metals ON clients (serves_metals) WHERE deleted_at IS NULL;
