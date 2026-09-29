-- Run after 001 and 002, as the migration owner. Browser roles cannot access
-- purchasing tables through Supabase's public Data API.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['policy_scopes','policy_versions','agent_runs','run_events','candidates','evaluations','balances','purchase_intents','operations','purchase_jobs','receipts','decision_logs','audit_jobs','service_health'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated, PUBLIC',t);
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='server_roles') THEN
   EXECUTE format('CREATE POLICY server_roles ON %I TO team11_agent,team11_policy_admin,team11_audit USING (true) WITH CHECK (true)',t);
  END IF;
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS scopes_owner ON policy_scopes(owner_id);
CREATE INDEX IF NOT EXISTS runs_owner_created ON agent_runs(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_owner_created ON receipts(owner_id,created_at DESC);
