-- Vibe Agent Transparent v2 — persistent DB-backed SSE

-- Add execution/channel columns to event log so both chat and inspector are replayable.
ALTER TABLE public.vibe_agent_events
  ADD COLUMN IF NOT EXISTS execution_id UUID;

ALTER TABLE public.vibe_agent_events
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'inspector';

ALTER TABLE public.vibe_agent_events
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS vibe_agent_events_execution_channel_idx
  ON public.vibe_agent_events(execution_id, channel, id ASC);

CREATE INDEX IF NOT EXISTS vibe_agent_events_conversation_channel_idx
  ON public.vibe_agent_events(conversation_id, channel, created_at ASC);

-- Execution lifecycle columns.
ALTER TABLE public.agent_executions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.agent_executions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE public.agent_executions
SET status = 'running'
WHERE status NOT IN ('running', 'success', 'partial', 'failed', 'cancelled');

DO $$
BEGIN
  ALTER TABLE public.agent_executions DROP CONSTRAINT IF EXISTS agent_executions_status_check;
END $$;

ALTER TABLE public.agent_executions
  ADD CONSTRAINT agent_executions_status_check
  CHECK (status IN ('running', 'success', 'partial', 'failed', 'cancelled'));
