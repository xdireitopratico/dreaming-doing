
-- Round 42: Memory System — agent_memory table for 3 scopes
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.agent_flows(id) ON DELETE CASCADE NOT NULL,
  session_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'short_term', -- short_term | long_term | episodic
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  importance_score REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL = never expires
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_agent_memory_flow_session ON public.agent_memory(flow_id, session_id, scope);
CREATE INDEX idx_agent_memory_key_lookup ON public.agent_memory(flow_id, session_id, key, scope);
CREATE INDEX idx_agent_memory_expires ON public.agent_memory(expires_at) WHERE expires_at IS NOT NULL;

-- Unique constraint: one key per flow+session+scope
CREATE UNIQUE INDEX idx_agent_memory_unique_key ON public.agent_memory(flow_id, session_id, key, scope);

-- Enable RLS
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- RLS: service role only (edge functions)
CREATE POLICY "Service role full access on agent_memory"
  ON public.agent_memory
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cleanup function for expired memories
CREATE OR REPLACE FUNCTION public.cleanup_expired_agent_memories()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.agent_memory
  WHERE expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
