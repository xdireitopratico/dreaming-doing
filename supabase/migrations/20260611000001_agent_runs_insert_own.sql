-- planApprove cria run de build via INSERT; só existiam policies SELECT/UPDATE.
CREATE POLICY "agent_runs_insert_own" ON public.agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );