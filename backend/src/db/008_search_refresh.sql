-- Existing databases need this grant for ANSWER and search refresh cleanup.
-- The agent may remove only derived search candidates and evaluations.
GRANT DELETE ON candidates,evaluations TO team11_agent;
