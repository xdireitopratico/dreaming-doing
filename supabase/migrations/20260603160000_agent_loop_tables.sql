-- Migration: agent_plans + agent_checkpoints para o loop faseado
-- Permite que o AgentLoop persista planos e checkpoints no Supabase

CREATE TABLE public.agent_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_plans_project_idx ON public.agent_plans(project_id, created_at DESC);

GRANT SELECT, INSERT ON public.agent_plans TO authenticated;
GRANT ALL ON public.agent_plans TO service_role;

ALTER TABLE public.agent_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_own" ON public.agent_plans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

CREATE POLICY "plans_insert_own" ON public.agent_plans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- ─── Checkpoints (persistência do estado do loop) ───
CREATE TABLE public.agent_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, conversation_id)
);

CREATE INDEX agent_checkpoints_project_idx ON public.agent_checkpoints(project_id);

GRANT SELECT, INSERT, UPDATE ON public.agent_checkpoints TO authenticated;
GRANT ALL ON public.agent_checkpoints TO service_role;

ALTER TABLE public.agent_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkpoints_select_own" ON public.agent_checkpoints FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));

CREATE POLICY "checkpoints_insert_own" ON public.agent_checkpoints FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));

CREATE POLICY "checkpoints_update_own" ON public.agent_checkpoints FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));

-- Trigger updated_at
CREATE TRIGGER checkpoints_touch BEFORE UPDATE ON public.agent_checkpoints FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime para agent_plans
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_plans;
ALTER TABLE public.agent_plans REPLICA IDENTITY FULL;
