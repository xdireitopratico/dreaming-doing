-- Liga agent_flows aos projetos FORGE (kind=agent)
ALTER TABLE public.agent_flows
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agent_flows_project_id
  ON public.agent_flows (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_flows_owner_project
  ON public.agent_flows (user_id, project_id);