-- agent_stream_events: SSE desacoplado do worker (Realtime)
-- agent_pending_messages: fila de mensagens enquanto agente ocupa o projeto

CREATE TABLE IF NOT EXISTS public.agent_stream_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS agent_stream_events_run_seq_idx
  ON public.agent_stream_events(run_id, seq);

GRANT SELECT ON public.agent_stream_events TO authenticated;
GRANT ALL ON public.agent_stream_events TO service_role;

ALTER TABLE public.agent_stream_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_events_select_own" ON public.agent_stream_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_runs r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = run_id AND p.owner_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.agent_pending_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_pending_messages_project_idx
  ON public.agent_pending_messages(project_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.agent_pending_messages TO authenticated;
GRANT ALL ON public.agent_pending_messages TO service_role;

ALTER TABLE public.agent_pending_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_msgs_select_own" ON public.agent_pending_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "pending_msgs_insert_own" ON public.agent_pending_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_stream_events;
ALTER TABLE public.agent_stream_events REPLICA IDENTITY FULL;