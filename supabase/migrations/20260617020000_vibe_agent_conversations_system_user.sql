-- Allow system-created conversations for edge function testing and background jobs
ALTER TABLE public.vibe_agent_conversations ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policies to allow null user_id for system conversations
DROP POLICY IF EXISTS "vibe_conv_select_own" ON public.vibe_agent_conversations;
DROP POLICY IF EXISTS "vibe_conv_insert_own" ON public.vibe_agent_conversations;
DROP POLICY IF EXISTS "vibe_conv_update_own" ON public.vibe_agent_conversations;

CREATE POLICY "vibe_conv_select_own"
  ON public.vibe_agent_conversations FOR SELECT TO authenticated
  USING (
    (user_id IS NULL OR user_id = auth.uid())
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
  USING ((user_id IS NULL OR user_id = auth.uid()))
  WITH CHECK ((user_id IS NULL OR user_id = auth.uid()));
