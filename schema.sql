-- 客户线索表
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  company    TEXT,
  topic      TEXT,
  message    TEXT NOT NULL,
  source     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone     ON leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_email     ON leads (email);
