CREATE TABLE qq_identities (
  platform TEXT NOT NULL DEFAULT 'onebot11',
  external_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (platform, external_user_id),
  UNIQUE (platform, user_id)
);

CREATE TABLE qq_login_tickets (
  token_hash TEXT PRIMARY KEY,
  external_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX idx_qq_login_tickets_expiry ON qq_login_tickets(expires_at);

ALTER TABLE comments ADD COLUMN source TEXT NOT NULL DEFAULT 'web';
ALTER TABLE comments ADD COLUMN source_message_id TEXT;
CREATE UNIQUE INDEX idx_comments_source_message
  ON comments(source, source_message_id)
  WHERE source_message_id IS NOT NULL;
