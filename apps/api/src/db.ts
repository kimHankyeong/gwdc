import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Db = InstanceType<typeof Database>;

const schema = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS policies (
    branch_id TEXT PRIMARY KEY,
    budget INTEGER NOT NULL CHECK (budget > 0),
    spent INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0),
    supplier_ids TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    request_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','planning','awaiting_chain','paid_simulated','paid_onchain','blocked','failed')),
    provider TEXT NOT NULL,
    plan_json TEXT,
    quote_json TEXT,
    policy_json TEXT,
    details_hash TEXT,
    tx_hash TEXT,
    policy_version INTEGER,
    token_usage_json TEXT,
    error TEXT,
    chain_mode TEXT NOT NULL CHECK (chain_mode IN ('simulated','rpc')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(branch_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS purchases_branch_created ON purchases(branch_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS purchases_status_created ON purchases(status, created_at);

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id TEXT REFERENCES purchases(id),
    branch_id TEXT,
    actor_id TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_created ON audit_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS audit_purchase ON audit_events(purchase_id, id);
`;

export function openDb(filename: string): Db {
  if (filename !== ":memory:") mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.exec(schema);
  return db;
}
