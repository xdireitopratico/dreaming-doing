
CREATE TABLE IF NOT EXISTS public.agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL,
  version_major INT NOT NULL DEFAULT 0,
  version_minor INT NOT NULL DEFAULT 1,
  version_patch INT NOT NULL DEFAULT 0,
  version_label TEXT GENERATED ALWAYS AS (version_major || '.' || version_minor || '.' || version_patch) STORED,
  snapshot_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_config JSONB DEFAULT '{}'::jsonb,
  changelog TEXT,
  change_type TEXT NOT NULL DEFAULT 'patch',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  CONSTRAINT valid_change_type CHECK (change_type IN ('major', 'minor', 'patch'))
);

CREATE INDEX idx_agent_versions_flow_id ON public.agent_versions(flow_id);
CREATE INDEX idx_agent_versions_created ON public.agent_versions(flow_id, created_at DESC);

ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent versions"
  ON public.agent_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert agent versions"
  ON public.agent_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own agent versions"
  ON public.agent_versions FOR UPDATE
  TO authenticated
  USING (true);
