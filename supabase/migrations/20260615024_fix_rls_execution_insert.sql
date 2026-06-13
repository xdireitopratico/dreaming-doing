-- SEC-1 FIX: Harden RLS INSERT policies on agent_executions and agent_execution_steps
-- Previously, any authenticated user could insert executions for any flow_id (WITH CHECK (true)).
-- Now restricted so users can only insert executions for flows they own.
-- The gateway uses service_role key which bypasses RLS, so real execution inserts still work.

-- agent_executions
DROP POLICY IF EXISTS "System can insert executions" ON public.agent_executions;
CREATE POLICY "Users insert executions for own flows"
  ON public.agent_executions FOR INSERT
  TO authenticated
  WITH CHECK (
    flow_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.agent_flows
      WHERE id = flow_id AND user_id = auth.uid()
    )
  );

-- agent_execution_steps
DROP POLICY IF EXISTS "System can insert steps" ON public.agent_execution_steps;
CREATE POLICY "Users insert steps for own executions"
  ON public.agent_execution_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_executions ae
      JOIN public.agent_flows af ON ae.flow_id = af.id
      WHERE ae.id = execution_id AND af.user_id = auth.uid()
    )
  );
