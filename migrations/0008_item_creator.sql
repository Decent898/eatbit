ALTER TABLE items ADD COLUMN creator_user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_items_creator_user_id ON items(creator_user_id);
