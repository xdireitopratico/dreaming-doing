-- Fix for vibe_agent_transparent_v2 migration
-- Ensures all required tables and columns exist

-- 0. LEGACY SCHEMA COMPATIBILITY
ALTER TABLE public.vibe_agent_conversations ALTER COLUMN user_id DROP NOT NULL;

-- 1. IDEMPOTENCY KEYS
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  response JSONB,
  status_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx ON public.idempotency_keys(expires_at);

-- 2. VIBE AGENT EVENTS
CREATE TABLE IF NOT EXISTS public.vibe_agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_start', 'session_end', 'thinking', 'tool_call', 'reasoning', 'checkpoint',
    'chat_intro', 'chat_loop_step', 'chat_plan_approved', 'chat_task_update', 'chat_closure', 'chat_error'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('inspector', 'chat')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vibe_agent_events_execution_idx ON public.vibe_agent_events(execution_id, sequence);
CREATE INDEX IF NOT EXISTS vibe_agent_events_conversation_idx ON public.vibe_agent_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vibe_agent_events_type_idx ON public.vibe_agent_events(event_type);

-- 3. FLOW VERSIONS
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

ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.agent_flows(id) ON DELETE CASCADE;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS patch JSONB;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS applied_by TEXT CHECK (applied_by IN ('user', 'agent'));
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES public.agent_flow_versions(id) ON DELETE SET NULL;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_flow_versions ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS agent_flow_versions_conv_idx ON public.agent_flow_versions(conversation_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS agent_flow_versions_flow_idx ON public.agent_flow_versions(flow_id, applied_at DESC);

-- 4. RATE LIMIT COUNTERS
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx ON public.rate_limit_counters(window_start);

-- 5. AGENT EXECUTIONS
CREATE TABLE IF NOT EXISTS public.agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'cancelled')),
  prompt TEXT NOT NULL,
  response TEXT,
  error TEXT,
  model TEXT,
  provider TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('running', 'success', 'partial', 'failed', 'cancelled'));
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS agent_executions_conversation_idx ON public.agent_executions(conversation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_request_idx ON public.agent_executions(request_id);

-- Ensure columns are NOT NULL where needed
ALTER TABLE public.vibe_agent_events ALTER COLUMN execution_id SET NOT NULL;
ALTER TABLE public.vibe_agent_events ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE public.vibe_agent_events ALTER COLUMN channel SET NOT NULL;
ALTER TABLE public.vibe_agent_events ALTER COLUMN payload SET NOT NULL;
ALTER TABLE public.vibe_agent_events ALTER COLUMN sequence SET NOT NULL;
ALTER TABLE public.vibe_agent_events ALTER COLUMN created_at SET NOT NULL;

-- Do not enforce NOT NULL on existing tables to avoid blocking legacy rows.
-- New inserts should still provide these values.

-- RLS policies
ALTER TABLE public.vibe_agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid duplicates
DROP POLICY IF EXISTS "Users can read own vibe agent events" ON public.vibe_agent_events;
DROP POLICY IF EXISTS "Users can insert own vibe agent events" ON public.vibe_agent_events;

CREATE POLICY "Users can read own vibe agent events"
  ON public.vibe_agent_events
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.vibe_agent_conversations
      WHERE auth.uid() = user_id
    )
  );

CREATE POLICY "Users can insert own vibe agent events"
  ON public.vibe_agent_events
  FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.vibe_agent_conversations
      WHERE auth.uid() = user_id
    )
  );

DROP POLICY IF EXISTS "Users can read own flow versions" ON public.agent_flow_versions;
DROP POLICY IF EXISTS "Users can insert own flow versions" ON public.agent_flow_versions;

CREATE POLICY "Users can read own flow versions"
  ON public.agent_flow_versions
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.vibe_agent_conversations
      WHERE auth.uid() = user_id
    )
  );

CREATE POLICY "Users can insert own flow versions"
  ON public.agent_flow_versions
  FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.vibe_agent_conversations
      WHERE auth.uid() = user_id
    )
  );

DROP POLICY IF EXISTS "Users can read own agent executions" ON public.agent_executions;
DROP POLICY IF EXISTS "Users can insert own agent executions" ON public.agent_executions;

CREATE POLICY "Users can read own agent executions"
  ON public.agent_executions
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.vibe_agent_conversations
      WHERE auth.uid() = user_id
    )
  );

CREATE POLICY "Users can insert own agent executions"
  ON public.agent_executions
  FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.vibe_agent_conversations
      WHERE auth.uid() = user_id
    )
  );

-- Service role bypass
ALTER TABLE public.vibe_agent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_flow_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_executions FORCE ROW LEVEL SECURITY;

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.idempotency_keys
  WHERE expires_at < now();
END;
$$;
