-- T03: canary_version_id em agent_deployments (vibrant 20260315120000)
-- Gateway SELECT inclui canary_version_id para canary routing.

ALTER TABLE public.agent_deployments
  ADD COLUMN IF NOT EXISTS canary_version_id UUID REFERENCES public.agent_flow_versions(id);

COMMENT ON COLUMN public.agent_deployments.canary_version_id IS
  'The flow version to serve for canary traffic. When canary_percent > 0, sessions are routed here.';