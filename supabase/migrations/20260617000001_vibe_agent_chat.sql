-- Vibe Agent chat — conversas do cliente no Flow Builder (isolado do boardroom)

CREATE TABLE public.vibe_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vibe_agent_conversations_flow_user_idx
  ON public.vibe_agent_conversations(flow_id, user_id, updated_at DESC);

CREATE TABLE public.vibe_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.vibe_agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vibe_agent_messages_conv_idx
  ON public.vibe_agent_messages(conversation_id, created_at);

ALTER TABLE public.vibe_agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vibe_conv_select_own"
  ON public.vibe_agent_conversations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid())
  );

CREATE POLICY "vibe_conv_insert_own"
  ON public.vibe_agent_conversations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid())
  );

CREATE POLICY "vibe_conv_update_own"
  ON public.vibe_agent_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "vibe_msg_select_own"
  ON public.vibe_agent_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vibe_agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "vibe_msg_insert_own"
  ON public.vibe_agent_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vibe_agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.vibe_agent_conversations TO authenticated;
GRANT SELECT, INSERT ON public.vibe_agent_messages TO authenticated;
GRANT ALL ON public.vibe_agent_conversations TO service_role;
GRANT ALL ON public.vibe_agent_messages TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.vibe_agent_messages;