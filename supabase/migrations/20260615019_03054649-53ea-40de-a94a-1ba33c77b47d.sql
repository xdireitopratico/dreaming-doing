
-- B1: Create prometheus_build_turns (parity with video_brainstorm_turns)
CREATE TABLE public.prometheus_build_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.prometheus_build_sessions(id) ON DELETE CASCADE,
    agent_key TEXT NOT NULL,
    agent_display TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'analysis',
    round INT DEFAULT 1,
    output_data JSONB,
    phase TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_prometheus_build_turns_session_created 
ON public.prometheus_build_turns(session_id, created_at);

-- RLS
ALTER TABLE public.prometheus_build_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own session turns"
ON public.prometheus_build_turns FOR SELECT TO authenticated
USING (session_id IN (
  SELECT id FROM public.prometheus_build_sessions WHERE user_id = auth.uid()
));

CREATE POLICY "Service inserts turns"
ON public.prometheus_build_turns FOR INSERT TO authenticated
WITH CHECK (session_id IN (
  SELECT id FROM public.prometheus_build_sessions WHERE user_id = auth.uid()
));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.prometheus_build_turns;
