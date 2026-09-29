-- Run as the database owner after migration. Grant these NOLOGIN roles to
-- distinct provisioned login accounts; never run the app as the table owner.
DO $$ BEGIN CREATE ROLE team11_agent NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE team11_policy_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE team11_audit NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO team11_agent,team11_policy_admin,team11_audit;
GRANT SELECT ON policy_scopes,policy_versions TO team11_agent;
GRANT UPDATE(lock_marker) ON policy_scopes TO team11_agent,team11_audit;
GRANT SELECT,INSERT,UPDATE ON agent_runs,run_events,candidates,evaluations,balances,purchase_intents,operations,purchase_jobs,audit_jobs TO team11_agent;
GRANT SELECT,INSERT ON receipts,decision_logs TO team11_agent;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO team11_policy_admin;
GRANT INSERT,UPDATE ON policy_scopes TO team11_policy_admin;
GRANT INSERT ON policy_versions,balances TO team11_policy_admin;
GRANT SELECT ON policy_scopes,receipts,purchase_intents,agent_runs,audit_jobs TO team11_audit;
GRANT UPDATE ON audit_jobs,agent_runs TO team11_audit;
GRANT SELECT ON service_health TO team11_agent,team11_policy_admin,team11_audit;
GRANT INSERT,UPDATE ON service_health TO team11_audit,team11_policy_admin;
