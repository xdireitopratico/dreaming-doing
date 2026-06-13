-- Garante no máximo um rascunho (draft) por projeto agente
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_flows_one_draft_per_project
  ON public.agent_flows (project_id)
  WHERE status = 'draft' AND project_id IS NOT NULL;