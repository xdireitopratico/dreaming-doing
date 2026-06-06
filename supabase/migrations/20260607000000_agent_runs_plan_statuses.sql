-- Plan Mode: allow new agent_runs.status values for awaiting/rejecting plan approval.
-- The CHECK constraint in 20260606180000_agent_runs_message_meta.sql is too narrow.
ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'canceled', 'awaiting_plan_approval', 'rejected'));
