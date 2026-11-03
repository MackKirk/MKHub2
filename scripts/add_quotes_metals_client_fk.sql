-- Optional: enforce quotes.client_id → metals_clients.id AFTER successful data migration.
-- Run only when verification shows zero orphan quote client_ids.

-- PostgreSQL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotes_metals_client_id'
  ) THEN
    ALTER TABLE quotes
      ADD CONSTRAINT fk_quotes_metals_client_id
      FOREIGN KEY (client_id) REFERENCES metals_clients(id);
  END IF;
END $$;
