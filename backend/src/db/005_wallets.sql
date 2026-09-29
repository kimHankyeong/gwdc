-- Per-user Sepolia signer addresses. Only the audit role can see ciphertext.
CREATE TABLE IF NOT EXISTS wallet_requests (
 owner_id text PRIMARY KEY, requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS owner_wallets (
 owner_id text PRIMARY KEY, address text NOT NULL UNIQUE,
 encrypted_key text NOT NULL, funded_at timestamptz, funding_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wallet_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_requests,owner_wallets FROM PUBLIC;
CREATE POLICY server_roles ON wallet_requests TO team11_agent,team11_audit USING (true) WITH CHECK (true);
CREATE POLICY server_roles ON owner_wallets TO team11_agent,team11_audit USING (true) WITH CHECK (true);
GRANT SELECT,INSERT ON wallet_requests TO team11_agent;
GRANT SELECT,DELETE ON wallet_requests TO team11_audit;
GRANT SELECT(owner_id,address,funded_at,funding_checked_at,created_at) ON owner_wallets TO team11_agent;
GRANT SELECT,INSERT,UPDATE ON owner_wallets TO team11_audit;
