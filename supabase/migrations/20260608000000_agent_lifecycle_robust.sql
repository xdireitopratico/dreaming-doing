-- Agent run lifecycle robustness (for stop, gates, heartbeats, circuit observability)
-- Safe additive columns. Existing code continues to work via meta/canceled_at/status.

ALTER TABLE IF EXISTS agent_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS awaiting_user_type text, -- 'qualify' | 'plan' | null
  ADD COLUMN IF NOT EXISTS last_error_code text;

-- Helpful indexes for queries in worker/index/start guards and monitoring
CREATE INDEX IF NOT EXISTS agent_runs_project_status_idx ON agent_runs (project_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_heartbeat_idx ON agent_runs (heartbeat_at) WHERE status = 'running';

-- Note: status values now include 'awaiting_user' (in addition to running/completed/failed/canceled).
-- Backfill not required; new runs and transitions set it explicitly via meta + status where used.

COMMENT ON COLUMN agent_runs.heartbeat_at IS 'Updated periodically by worker/loop for stale detection and responsive cancel.';
COMMENT ON COLUMN agent_runs.awaiting_user_type IS 'When set, start logic must queue instead of starting new execution (qualify/plan gates).';
COMMENT ON COLUMN agent_runs.last_error_code IS 'Structured code e.g. e2b_creation_circuit for UI and retry policy.';
