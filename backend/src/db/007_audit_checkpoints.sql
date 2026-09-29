-- Durable signer state. Exact JSON bytes are kept as text because the HMAC
-- authenticates JSON.stringify(state); jsonb key reordering would break it.
CREATE TABLE IF NOT EXISTS audit_checkpoints (
 request_id text PRIMARY KEY REFERENCES audit_jobs(request_id),
 checkpoint_text text,
 report_text text,
 fence integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON audit_checkpoints FROM PUBLIC;
CREATE POLICY audit_only ON audit_checkpoints TO team11_audit USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE ON audit_checkpoints TO team11_audit;
