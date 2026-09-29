CREATE TABLE IF NOT EXISTS policy_scopes (
 id text PRIMARY KEY, owner_id text NOT NULL, mode text NOT NULL DEFAULT 'NORMAL' CHECK(mode IN ('NORMAL','POLICY_EDIT')),
 active_version integer NOT NULL, edit_id text, edit_base integer, edit_owner text
);
CREATE TABLE IF NOT EXISTS policy_versions (
 scope_id text REFERENCES policy_scopes(id), version integer NOT NULL, digest text NOT NULL,
 policy jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope_id,version)
);
-- Row locks require UPDATE privilege on at least one column. This marker grants
-- runtime locks without granting permission to change the active policy or mode.
ALTER TABLE policy_scopes ADD COLUMN IF NOT EXISTS lock_marker integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS agent_runs (
 id text PRIMARY KEY, owner_id text NOT NULL, scope_id text NOT NULL REFERENCES policy_scopes(id),
 policy_version integer NOT NULL, policy_digest text NOT NULL, track text NOT NULL CHECK(track IN ('Plan','HardInput')),
 input jsonb NOT NULL, input_version integer NOT NULL DEFAULT 1, auto_purchase boolean NOT NULL DEFAULT false, state text NOT NULL,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 constraints jsonb, constraint_version integer NOT NULL DEFAULT 0, constraint_approval jsonb,
 question jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS active_scope_runs ON agent_runs(scope_id) WHERE active;
CREATE TABLE IF NOT EXISTS run_events (
 run_id text REFERENCES agent_runs(id), event_id text NOT NULL, fingerprint text NOT NULL,
 PRIMARY KEY(run_id,event_id)
);
CREATE TABLE IF NOT EXISTS candidates (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES agent_runs(id), data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS evaluations (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES agent_runs(id), constraint_version integer NOT NULL,
 policy_digest text NOT NULL, kind text NOT NULL, result jsonb NOT NULL, input_digest text NOT NULL
);
CREATE TABLE IF NOT EXISTS balances (
 owner_id text NOT NULL, scope_id text NOT NULL REFERENCES policy_scopes(id), currency text NOT NULL,
 balance numeric(36,0) NOT NULL CHECK(balance>=0), spent numeric(36,0) NOT NULL DEFAULT 0 CHECK(spent>=0),
 reserved numeric(36,0) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=balance),
 mode text NOT NULL DEFAULT 'SIMULATION' CHECK(mode='SIMULATION'),
 PRIMARY KEY(owner_id,scope_id,currency)
);
CREATE TABLE IF NOT EXISTS purchase_intents (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES agent_runs(id), owner_id text NOT NULL,
 scope_id text NOT NULL REFERENCES policy_scopes(id), prepare_key text NOT NULL UNIQUE,
 policy_version integer NOT NULL, policy_digest text NOT NULL, constraint_version integer NOT NULL,
 mode text NOT NULL DEFAULT 'SIMULATION' CHECK(mode='SIMULATION'),
 quote jsonb NOT NULL, quote_version integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL,
 approval jsonb, generation integer NOT NULL DEFAULT 1, state text NOT NULL,
 reserved numeric(36,0) NOT NULL DEFAULT 0 CHECK(reserved>=0), audit_input jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS operations (
 owner_id text NOT NULL, key text NOT NULL, fingerprint text NOT NULL, intent_id text NOT NULL REFERENCES purchase_intents(id),
 PRIMARY KEY(owner_id,key)
);
CREATE TABLE IF NOT EXISTS purchase_jobs (
 intent_id text NOT NULL REFERENCES purchase_intents(id), generation integer NOT NULL,
 state text NOT NULL DEFAULT 'PENDING', lease_until timestamptz, fence integer NOT NULL DEFAULT 0,
 PRIMARY KEY(intent_id,generation)
);
CREATE TABLE IF NOT EXISTS receipts (
 id text PRIMARY KEY, intent_id text NOT NULL UNIQUE REFERENCES purchase_intents(id),
 owner_id text NOT NULL, scope_id text NOT NULL, mode text NOT NULL CHECK(mode='SIMULATION'),
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS decision_logs (
 intent_id text PRIMARY KEY REFERENCES purchase_intents(id), owner_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')), reason text NOT NULL,
 policy_digest text NOT NULL, currency text NOT NULL, amount text NOT NULL,
 mode text NOT NULL DEFAULT 'SIMULATION' CHECK(mode='SIMULATION'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_jobs (
 receipt_id text PRIMARY KEY REFERENCES receipts(id), request_id text NOT NULL UNIQUE,
 scope_id text NOT NULL, input jsonb NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING', report jsonb, lease_until timestamptz, fence integer NOT NULL DEFAULT 0,
 next_attempt timestamptz NOT NULL DEFAULT now(), source_mode text NOT NULL DEFAULT 'SIMULATION' CHECK(source_mode='SIMULATION')
);
CREATE INDEX IF NOT EXISTS unresolved_audits ON audit_jobs(scope_id) WHERE state <> 'FINALIZED';
CREATE TABLE IF NOT EXISTS service_health (
 name text PRIMARY KEY, state text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS error_code text;
CREATE OR REPLACE FUNCTION forbid_published_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_RECORD'; END $$;
DROP TRIGGER IF EXISTS immutable_policy ON policy_versions;
CREATE TRIGGER immutable_policy BEFORE UPDATE OR DELETE ON policy_versions FOR EACH ROW EXECUTE FUNCTION forbid_published_mutation();
DROP TRIGGER IF EXISTS immutable_receipt ON receipts;
CREATE TRIGGER immutable_receipt BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION forbid_published_mutation();
DROP TRIGGER IF EXISTS immutable_decision ON decision_logs;
CREATE TRIGGER immutable_decision BEFORE UPDATE OR DELETE ON decision_logs FOR EACH ROW EXECUTE FUNCTION forbid_published_mutation();
