CREATE TABLE IF NOT EXISTS projects (
 id text PRIMARY KEY, owner_id text NOT NULL, scope_id text NOT NULL REFERENCES policy_scopes(id),
 topic text NOT NULL, budget numeric(36,0) NOT NULL CHECK(budget>0),
 request_key text NOT NULL, state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','APPROVED','COMPLETED','CANCELED')),
 assembly_steps jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,request_key)
);
CREATE INDEX IF NOT EXISTS projects_owner_created ON projects(owner_id,created_at DESC);
CREATE TABLE IF NOT EXISTS project_items (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), position integer NOT NULL,
 name text NOT NULL, search_query text NOT NULL, rationale text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100), allocation numeric(36,0) NOT NULL CHECK(allocation>0),
 run_id text UNIQUE REFERENCES agent_runs(id), UNIQUE(project_id,position)
);
CREATE INDEX IF NOT EXISTS project_items_run ON project_items(run_id) WHERE run_id IS NOT NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['projects','project_items'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated, PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='team11_agent') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO team11_agent',t);
   IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='server_roles') THEN
    EXECUTE format('CREATE POLICY server_roles ON %I TO team11_agent USING (true) WITH CHECK (true)',t);
   END IF;
  END IF;
 END LOOP;
END $$;
