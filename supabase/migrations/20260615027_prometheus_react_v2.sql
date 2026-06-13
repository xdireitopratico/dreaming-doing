-- ============================================================
-- Prometheus ReAct v2 — Schema changes for autonomous builder
-- D5: Token budget per session
-- D6: Research cache shared between agents
-- Business plan report storage
-- Tool call audit trail on turns
-- ============================================================

-- M1: Token budget + research cache + report on sessions
ALTER TABLE prometheus_build_sessions
  ADD COLUMN IF NOT EXISTS token_budget INT NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS tokens_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS research_cache JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS report JSONB;

-- M2: Tool audit on turns (which tools were called during this turn)
ALTER TABLE prometheus_build_turns
  ADD COLUMN IF NOT EXISTS tool_calls JSONB;
-- tool_calls format: [{ tool: string, input: any, output: any, latency_ms: number }]

-- Index for quick token budget queries
CREATE INDEX IF NOT EXISTS idx_prometheus_sessions_tokens
  ON prometheus_build_sessions (tokens_used, token_budget)
  WHERE tokens_used > 0;
