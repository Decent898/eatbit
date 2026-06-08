CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price TEXT NOT NULL DEFAULT '',
  heat INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  is_off_shelf INTEGER NOT NULL DEFAULT 0,
  off_shelf_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE shops ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN closed_at TEXT;
ALTER TABLE shops ADD COLUMN creator_user_id INTEGER REFERENCES users(id);
ALTER TABLE comments ADD COLUMN item_id TEXT REFERENCES items(id);
ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_items_shop_id ON items(shop_id);
CREATE INDEX IF NOT EXISTS idx_items_off_shelf ON items(is_off_shelf);
CREATE INDEX IF NOT EXISTS idx_shops_closed ON shops(is_closed);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
