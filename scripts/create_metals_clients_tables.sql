-- Mack Kirk Metals CRM tables (distinct from Hub clients).
-- Non-destructive: creates metals_* only; does not alter Hub clients or quotes.

CREATE TABLE IF NOT EXISTS metals_clients (
  id UUID PRIMARY KEY,
  code VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  display_name VARCHAR(255),
  client_type VARCHAR(50),
  client_status VARCHAR(50),
  lead_source VARCHAR(100),
  estimator_id UUID REFERENCES users(id),
  description VARCHAR(4000),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  province VARCHAR(100),
  postal_code VARCHAR(50),
  country VARCHAR(100),
  billing_address_line1 VARCHAR(255),
  billing_address_line2 VARCHAR(255),
  billing_city VARCHAR(100),
  billing_province VARCHAR(100),
  billing_postal_code VARCHAR(50),
  billing_country VARCHAR(100),
  billing_same_as_address BOOLEAN NOT NULL DEFAULT FALSE,
  type_id UUID,
  status_id UUID,
  payment_terms_id UUID,
  billing_contact VARCHAR(255),
  invoice_to VARCHAR(255),
  billing_email VARCHAR(255),
  po_required BOOLEAN NOT NULL DEFAULT FALSE,
  tax_number VARCHAR(100),
  dataforma_id VARCHAR(100) UNIQUE,
  preferred_language VARCHAR(50),
  preferred_channels JSONB,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_delivery_method VARCHAR(50),
  statement_delivery_method VARCHAR(50),
  cc_emails_for_invoices JSONB,
  cc_emails_for_estimates JSONB,
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  do_not_contact_reason VARCHAR(500),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_metals_clients_code ON metals_clients (code);
CREATE INDEX IF NOT EXISTS ix_metals_clients_deleted_at ON metals_clients (deleted_at);
CREATE INDEX IF NOT EXISTS ix_metals_clients_is_system ON metals_clients (is_system);

CREATE TABLE IF NOT EXISTS metals_client_contacts (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role_title VARCHAR(100),
  department VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(100),
  phone_extension VARCHAR(20),
  mobile_phone VARCHAR(100),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  notes VARCHAR(1000),
  role_tags JSONB
);

CREATE INDEX IF NOT EXISTS ix_metals_client_contacts_client_id ON metals_client_contacts (client_id);

CREATE TABLE IF NOT EXISTS metals_client_sites (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  site_name VARCHAR(255),
  site_address_line1 VARCHAR(255),
  site_address_line1_complement VARCHAR(255),
  site_address_line2 VARCHAR(255),
  site_address_line2_complement VARCHAR(255),
  site_address_line3 VARCHAR(255),
  site_address_line3_complement VARCHAR(255),
  site_city VARCHAR(100),
  site_province VARCHAR(100),
  site_postal_code VARCHAR(50),
  site_country VARCHAR(100),
  site_lat NUMERIC(10, 7),
  site_lng NUMERIC(10, 7),
  site_notes VARCHAR(1000),
  sort_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_metals_client_sites_client_id ON metals_client_sites (client_id);

CREATE TABLE IF NOT EXISTS metals_client_folders (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES metals_client_folders(id) ON DELETE SET NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  access_permissions JSONB
);

CREATE INDEX IF NOT EXISTS ix_metals_client_folders_client_id ON metals_client_folders (client_id);

CREATE TABLE IF NOT EXISTS metals_client_files (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  site_id UUID REFERENCES metals_client_sites(id) ON DELETE CASCADE,
  file_object_id UUID NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
  category VARCHAR(100),
  folder_id UUID REFERENCES metals_client_folders(id) ON DELETE SET NULL,
  key VARCHAR(1024),
  original_name VARCHAR(255),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID,
  notes VARCHAR(1000),
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_metals_client_files_client_id ON metals_client_files (client_id);
CREATE INDEX IF NOT EXISTS ix_metals_client_files_deleted_at ON metals_client_files (deleted_at);

CREATE TABLE IF NOT EXISTS metals_client_documents (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  doc_type VARCHAR(100) NOT NULL,
  title VARCHAR(255),
  notes VARCHAR(1000),
  file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_metals_client_documents_client_id ON metals_client_documents (client_id);
CREATE INDEX IF NOT EXISTS ix_metals_client_documents_deleted_at ON metals_client_documents (deleted_at);

CREATE TABLE IF NOT EXISTS metals_client_notes (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  title VARCHAR(255),
  category_id VARCHAR(100),
  description TEXT,
  images JSONB,
  status VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_metals_client_notes_client_created ON metals_client_notes (client_id, created_at);

CREATE TABLE IF NOT EXISTS metals_migration_batches (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  mode VARCHAR(20) NOT NULL,
  quotes_count INTEGER,
  distinct_hub_clients INTEGER,
  cloned_clients INTEGER,
  remapped_quotes INTEGER,
  hub_hidden INTEGER,
  notes TEXT,
  ok BOOLEAN
);

CREATE TABLE IF NOT EXISTS metals_client_id_map (
  hub_client_id UUID PRIMARY KEY,
  metals_client_id UUID NOT NULL UNIQUE REFERENCES metals_clients(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL,
  cloned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metals_contact_id_map (
  hub_contact_id UUID PRIMARY KEY,
  metals_contact_id UUID NOT NULL UNIQUE REFERENCES metals_client_contacts(id) ON DELETE CASCADE,
  hub_client_id UUID NOT NULL,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS metals_site_id_map (
  hub_site_id UUID PRIMARY KEY,
  metals_site_id UUID NOT NULL UNIQUE REFERENCES metals_client_sites(id) ON DELETE CASCADE,
  hub_client_id UUID NOT NULL,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS metals_folder_id_map (
  hub_folder_id UUID PRIMARY KEY,
  metals_folder_id UUID NOT NULL UNIQUE REFERENCES metals_client_folders(id) ON DELETE CASCADE,
  hub_client_id UUID NOT NULL,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS metals_file_id_map (
  hub_file_id UUID PRIMARY KEY,
  metals_file_id UUID NOT NULL UNIQUE REFERENCES metals_client_files(id) ON DELETE CASCADE,
  hub_client_id UUID NOT NULL,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS metals_document_id_map (
  hub_document_id UUID PRIMARY KEY,
  metals_document_id UUID NOT NULL UNIQUE REFERENCES metals_client_documents(id) ON DELETE CASCADE,
  hub_client_id UUID NOT NULL,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS metals_note_id_map (
  hub_note_id UUID PRIMARY KEY,
  metals_note_id UUID NOT NULL UNIQUE REFERENCES metals_client_notes(id) ON DELETE CASCADE,
  hub_client_id UUID NOT NULL,
  batch_id UUID REFERENCES metals_migration_batches(id) ON DELETE SET NULL
);
