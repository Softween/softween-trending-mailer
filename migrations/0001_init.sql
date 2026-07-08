CREATE TABLE IF NOT EXISTS trending_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  repo_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON trending_snapshots(date);

CREATE TABLE IF NOT EXISTS trending_repos (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('daily', 'weekly', 'monthly')),
  rank INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  language TEXT DEFAULT '',
  stars INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  period_stars INTEGER DEFAULT 0,
  period_label TEXT DEFAULT '',
  url TEXT NOT NULL,
  readme TEXT,
  ai_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshot_id) REFERENCES trending_snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_repos_snapshot ON trending_repos(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_repos_period ON trending_repos(period);
CREATE INDEX IF NOT EXISTS idx_repos_full_name ON trending_repos(full_name);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirm_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
