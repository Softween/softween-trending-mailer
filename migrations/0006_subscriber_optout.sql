-- 0006_subscriber_optout.sql
-- One-time additive migration. SQLite has no ADD COLUMN IF NOT EXISTS; do NOT re-run against a DB that already has these columns.
ALTER TABLE subscribers ADD COLUMN unsubscribe_token TEXT;
ALTER TABLE subscribers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscribers ADD COLUMN consent_ip TEXT;
ALTER TABLE subscribers ADD COLUMN unsubscribed_at TEXT;

-- Backfill tokens for any pre-existing rows (hex from randomblob).
UPDATE subscribers
SET unsubscribe_token = lower(hex(randomblob(16)))
WHERE unsubscribe_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON subscribers(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(active);
