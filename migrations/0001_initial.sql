CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  campus TEXT NOT NULL CHECK (campus IN ('良乡校区', '中关村校区')),
  kind TEXT NOT NULL CHECK (kind IN ('食堂', '宿舍楼下', '商业区', '其他地点')),
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  creator TEXT NOT NULL DEFAULT '当前用户',
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user TEXT NOT NULL DEFAULT '我',
  score REAL NOT NULL CHECK (score >= 0 AND score <= 5),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_areas_campus ON areas(campus);
CREATE INDEX IF NOT EXISTS idx_shops_area_id ON shops(area_id);
CREATE INDEX IF NOT EXISTS idx_comments_shop_id ON comments(shop_id);
