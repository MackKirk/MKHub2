-- MK Metals public website: Metals identity + catalog + membership + inbound submissions.
-- Non-destructive: CREATE IF NOT EXISTS only. For existing DBs that still share Hub portal
-- users, run scripts/separate_metals_portal_auth.py instead.

CREATE TABLE IF NOT EXISTS portal_metals_users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_portal_metals_users_email ON portal_metals_users (email);

CREATE TABLE IF NOT EXISTS portal_metals_refresh_tokens (
  id UUID PRIMARY KEY,
  metals_user_id UUID NOT NULL REFERENCES portal_metals_users(id) ON DELETE CASCADE,
  jti VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_portal_metals_refresh_tokens_metals_user_id ON portal_metals_refresh_tokens (metals_user_id);
CREATE INDEX IF NOT EXISTS ix_portal_metals_refresh_tokens_jti ON portal_metals_refresh_tokens (jti);

CREATE TABLE IF NOT EXISTS portal_metals_password_resets (
  id UUID PRIMARY KEY,
  metals_user_id UUID NOT NULL REFERENCES portal_metals_users(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_portal_metals_password_resets_metals_user_id ON portal_metals_password_resets (metals_user_id);
CREATE INDEX IF NOT EXISTS ix_portal_metals_password_resets_token ON portal_metals_password_resets (token);

CREATE TABLE IF NOT EXISTS portal_metals_memberships (
  id UUID PRIMARY KEY,
  metals_user_id UUID NOT NULL REFERENCES portal_metals_users(id) ON DELETE CASCADE,
  metals_client_id UUID NOT NULL REFERENCES metals_clients(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_portal_metals_membership_user_client UNIQUE (metals_user_id, metals_client_id)
);

CREATE INDEX IF NOT EXISTS ix_portal_metals_memberships_metals_user_id ON portal_metals_memberships (metals_user_id);
CREATE INDEX IF NOT EXISTS ix_portal_metals_memberships_metals_client_id ON portal_metals_memberships (metals_client_id);

CREATE TABLE IF NOT EXISTS metals_catalog_categories (
  id UUID PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_metals_catalog_categories_slug ON metals_catalog_categories (slug);

CREATE TABLE IF NOT EXISTS metals_catalog_products (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES metals_catalog_categories(id) ON DELETE SET NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  short_description VARCHAR(500),
  description TEXT,
  specs JSONB,
  image_url VARCHAR(1024),
  image_file_object_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_metals_catalog_products_slug ON metals_catalog_products (slug);
CREATE INDEX IF NOT EXISTS ix_metals_catalog_products_category_id ON metals_catalog_products (category_id);
CREATE INDEX IF NOT EXISTS ix_metals_catalog_products_is_published ON metals_catalog_products (is_published);

CREATE TABLE IF NOT EXISTS metals_website_submissions (
  id UUID PRIMARY KEY,
  submission_code VARCHAR(40) NOT NULL UNIQUE,
  kind VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(100),
  company_name VARCHAR(255),
  customer_type VARCHAR(50),
  project_po VARCHAR(100),
  notes TEXT,
  delivery_method VARCHAR(20),
  delivery_address TEXT,
  notification_prefs JSONB,
  metals_client_id UUID REFERENCES metals_clients(id) ON DELETE SET NULL,
  metals_user_id UUID REFERENCES portal_metals_users(id) ON DELETE SET NULL,
  converted_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  internal_notes TEXT,
  source VARCHAR(50) DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  status_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_code ON metals_website_submissions (submission_code);
CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_kind ON metals_website_submissions (kind);
CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_status ON metals_website_submissions (status);
CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_email ON metals_website_submissions (contact_email);
CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_client ON metals_website_submissions (metals_client_id);
CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_metals_user ON metals_website_submissions (metals_user_id);
CREATE INDEX IF NOT EXISTS ix_metals_website_submissions_created ON metals_website_submissions (created_at);

CREATE TABLE IF NOT EXISTS metals_website_submission_items (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES metals_website_submissions(id) ON DELETE CASCADE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  catalog_product_id UUID REFERENCES metals_catalog_products(id) ON DELETE SET NULL,
  description VARCHAR(500) NOT NULL,
  gauge VARCHAR(50),
  colour VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS ix_metals_website_submission_items_sub ON metals_website_submission_items (submission_id);
CREATE INDEX IF NOT EXISTS idx_metals_website_submission_items_sub_sort ON metals_website_submission_items (submission_id, sort_index);

CREATE TABLE IF NOT EXISTS metals_website_submission_files (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES metals_website_submissions(id) ON DELETE CASCADE,
  item_id UUID REFERENCES metals_website_submission_items(id) ON DELETE CASCADE,
  file_object_id UUID NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
  original_name VARCHAR(500),
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_metals_website_submission_files_sub ON metals_website_submission_files (submission_id);
CREATE INDEX IF NOT EXISTS idx_metals_website_submission_files_sub_sort ON metals_website_submission_files (submission_id, sort_index);
