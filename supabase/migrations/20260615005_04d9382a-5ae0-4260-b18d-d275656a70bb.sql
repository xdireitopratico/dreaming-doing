
CREATE TABLE public.agent_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  flow_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  flow_name TEXT,
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_flow_versions_flow ON public.agent_flow_versions(flow_id, version DESC);

ALTER TABLE public.agent_flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flow versions"
  ON public.agent_flow_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own flow versions"
  ON public.agent_flow_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid()
    )
  );
