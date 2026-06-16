-- Vibe Agent Transparent v2 — SSE dual stream, idempotency, inspector events, flow versioning

-- 1. IDEMPOTENCY KEYS
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx
  ON public.idempotency_keys(expires_at);

-- 2. AGENT EVENTS (para inspector replay/debug)
CREATE TABLE IF NOT EXISTS public.vibe_agent_events (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vibe_agent_events_conv_idx
  ON public.vibe_agent_events(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS vibe_agent_events_request_idx
  ON public.vibe_agent_events(request_id);

-- 3. FLOW VERSIONS (undo/history)
CREATE TABLE IF NOT EXISTS public.agent_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  patch JSONB NOT NULL,
  applied_by TEXT NOT NULL CHECK (applied_by IN ('user', 'agent')),
  parent_version_id UUID REFERENCES public.agent_flow_versions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure required columns exist for existing tables
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.agent_flows(id) ON DELETE CASCADE;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS patch JSONB;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS applied_by TEXT CHECK (applied_by IN ('user', 'agent'));
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES public.agent_flow_versions(id) ON DELETE SET NULL;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS agent_flow_versions_conv_idx
  ON public.agent_flow_versions(conversation_id, applied_at DESC);

-- 4. RATE LIMITING (por usuário/conversa)
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx
  ON public.rate_limit_counters(window_start);

-- 5. EXECUTION METRICS
CREATE TABLE IF NOT EXISTS public.agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  model TEXT,
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'cancelled')),
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_executions_conv_idx
  ON public.agent_executions(conversation_id, created_at DESC);

-- RLS for vibe_agent_events
ALTER TABLE public.vibe_agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vibe_events_select_own"
  ON public.vibe_agent_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vibe_agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "vibe_events_insert_service"
  ON public.vibe_agent_events FOR INSERT TO service_role
  WITH CHECK (true);

-- RLS for agent_flow_versions
ALTER TABLE public.agent_flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_versions_select_own"
  ON public.agent_flow_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vibe_agent_conversations c
      JOIN public.agent_flows af ON af.id = c.flow_id
      WHERE c.id = conversation_id AND af.user_id = auth.uid()
    )
  );

CREATE POLICY "agent_versions_insert_service"
  ON public.agent_flow_versions FOR INSERT TO service_role
  WITH CHECK (true);

-- RLS for agent_executions
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_executions_select_own"
  ON public.agent_executions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vibe_agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "agent_executions_insert_service"
  ON public.agent_executions FOR INSERT TO service_role
  WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT ON public.vibe_agent_events TO authenticated;
GRANT ALL ON public.vibe_agent_events TO service_role;

GRANT SELECT ON public.agent_flow_versions TO authenticated;
GRANT ALL ON public.agent_flow_versions TO service_role;

GRANT SELECT ON public.agent_executions TO authenticated;
GRANT ALL ON public.agent_executions TO service_role;

GRANT ALL ON public.idempotency_keys TO service_role;
GRANT ALL ON public.rate_limit_counters TO service_role;

-- Cleanup old idempotency keys (TTL 24h)
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM public.idempotency_keys
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Note: schedule this function via pg_cron if available
-- SELECT cron.schedule('cleanup-idempotency-keys', '0 * * * *', $$SELECT public.cleanup_expired_idempotency_keys()$$);
