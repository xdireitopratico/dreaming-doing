-- T02: RLS tenant_secrets por ownership do agent_flow
-- tenant_id = flowId (não auth.uid()); SecretsPanel grava com tenant_id = flowId.

DROP POLICY IF EXISTS "Tenants manage own secrets" ON public.tenant_secrets;

CREATE POLICY "Tenants manage own secrets"
  ON public.tenant_secrets FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid())
  );