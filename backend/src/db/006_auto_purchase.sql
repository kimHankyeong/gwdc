-- Additive migration for explicit per-run simulated auto-purchase consent.
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS auto_purchase boolean NOT NULL DEFAULT false;
