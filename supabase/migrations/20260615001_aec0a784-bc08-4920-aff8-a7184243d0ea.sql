
-- ============================================
-- AetherForge: Tabelas Fundamentais (Bloco 1)
-- agent_flows, agent_flow_nodes, agent_deployments
-- ============================================

-- 1. agent_flows — Definição do Agente
CREATE TABLE public.agent_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  flow_definition JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  flow_schema_version INT DEFAULT 1,
  version INT DEFAULT 1,
  parent_version_id UUID REFERENCES public.agent_flows(id),
  status TEXT DEFAULT 'draft',
  is_template BOOLEAN DEFAULT false,
  template_price_cents INT,
  template_category TEXT,
  tags TEXT[] DEFAULT '{}',
  channels TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  total_executions BIGINT DEFAULT 0,
  avg_quality_score NUMERIC(3,2),
  avg_latency_ms INT,
  total_cost_cents BIGINT DEFAULT 0
);

ALTER TABLE public.agent_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own flows"
  ON public.agent_flows FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can view published templates"
  ON public.agent_flows FOR SELECT
  TO authenticated
  USING (is_template = true AND status = 'published');

-- 2. agent_flow_nodes — Nós do Grafo
CREATE TABLE public.agent_flow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  node_config JSONB NOT NULL DEFAULT '{}',
  input_schema JSONB,
  output_schema JSONB,
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_flow_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage nodes via flow ownership"
  ON public.agent_flow_nodes FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()));

-- 3. agent_deployments — Deploy por Canal
CREATE TABLE public.agent_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  flow_version INT NOT NULL DEFAULT 1,
  channel TEXT NOT NULL,
  channel_config JSONB DEFAULT '{}',
  endpoint_slug TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  canary_percent INT DEFAULT 0,
  canary_baseline_version_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage deployments via flow ownership"
  ON public.agent_deployments FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()));

-- Índices
CREATE INDEX idx_agent_flows_user ON public.agent_flows(user_id);
CREATE INDEX idx_agent_flows_status ON public.agent_flows(status);
CREATE INDEX idx_agent_flows_template ON public.agent_flows(is_template) WHERE is_template = true;
CREATE INDEX idx_agent_flow_nodes_flow ON public.agent_flow_nodes(flow_id);
CREATE INDEX idx_agent_deployments_flow ON public.agent_deployments(flow_id);
CREATE INDEX idx_agent_deployments_slug ON public.agent_deployments(endpoint_slug);
