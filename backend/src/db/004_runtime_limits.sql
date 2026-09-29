-- Bounded operational counters, not prompt or user message logs.
CREATE TABLE IF NOT EXISTS runtime_limits (
 key text PRIMARY KEY, window_started timestamptz NOT NULL, count integer NOT NULL
);
ALTER TABLE runtime_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON runtime_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON runtime_limits TO team11_agent,team11_policy_admin;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='runtime_limits' AND policyname='server_roles') THEN
  CREATE POLICY server_roles ON runtime_limits TO team11_agent,team11_policy_admin USING(true) WITH CHECK(true);
 END IF;
END $$;
