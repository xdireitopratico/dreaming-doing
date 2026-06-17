-- ============================================================================
-- Streaming Telemetry — observability for chat reliability
-- ============================================================================
-- Background: Fase 1.1 of the Vibe Code reliability plan. We need to *prove*
-- which failure modes users hit (race catchup↔realtime, shape mismatch,
-- slot preso, dispatch fail, plan source runId missing) before declaring
-- them fixed. Without telemetry, "mensagem não apareceu" is just a complaint.
--
-- Schema:
--   - project_id: scope; allows per-project dashboards and rate-limiting on writes
--   - run_id: nullable; many events are run-scoped, but some are chat-session
--     scoped (user_message_rendered, materialized_release_pending) where the
--     runId may not exist yet or has been released
--   - event_name: short tag (see streaming-telemetry.ts for the canonical list)
--   - payload jsonb: event-specific metadata (latencyMs, attempt, source, etc)
--   - created_at: insert timestamp
--
-- Realtime OFF: telemetry is read-only via dashboard, never via Realtime.
-- Writes are fire-and-forget; we never block the UI on telemetry success.
-- Indexes: per project + recent first (for dashboards), per event_name
-- (for "show me all seq_dropped events"), per run_id (for "show me the
-- failure path of this specific run").
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_streaming_telemetry (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  run_id UUID,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_streaming_telemetry_project_recent_idx
  ON public.agent_streaming_telemetry(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_streaming_telemetry_event_name_idx
  ON public.agent_streaming_telemetry(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_streaming_telemetry_run_id_idx
  ON public.agent_streaming_telemetry(run_id, created_at DESC)
  WHERE run_id IS NOT NULL;

ALTER TABLE public.agent_streaming_telemetry ENABLE ROW LEVEL SECURITY;

-- Owner can read their own project's telemetry.
CREATE POLICY "agent_streaming_telemetry_select_own"
  ON public.agent_streaming_telemetry
  FOR SELECT
  TO authenticated
  USING (project_id IN (
    SELECT id FROM public.projects WHERE owner_id = auth.uid()
  ));

-- Service role can write (the client uses anon key with a fire-and-forget
-- insert via supabase.from(); service role key is only used by the server
-- telemetry helper, when present). Authenticated users can insert telemetry
-- about their own runs as best-effort.
CREATE POLICY "agent_streaming_telemetry_insert_own"
  ON public.agent_streaming_telemetry
  FOR INSERT
  TO authenticated
  WITH CHECK (project_id IN (
    SELECT id FROM public.projects WHERE owner_id = auth.uid()
  ));
