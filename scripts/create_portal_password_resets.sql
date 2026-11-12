-- Portal customer password reset tokens (Metals / Hub portal users).
-- Non-destructive: CREATE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS portal_password_resets (
  id UUID PRIMARY KEY,
  portal_user_id UUID NOT NULL REFERENCES portal_hub_users(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_portal_password_resets_portal_user_id ON portal_password_resets (portal_user_id);
CREATE INDEX IF NOT EXISTS ix_portal_password_resets_token ON portal_password_resets (token);
