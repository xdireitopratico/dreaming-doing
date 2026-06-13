
-- ============================================
-- AetherForge: Execuções + Observabilidade (Bloco 2)
-- agent_executions, agent_execution_steps, execution_dead_letter_queue
-- ============================================

-- 4. agent_executions — Log de Execuções + FSM State
CREATE TABLE public.agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.agent_flows(id),
  flow_version INT NOT NULL DEFAULT 1,
  deployment_id UUID REFERENCES public.agent_deployments(id),
  tenant_id UUID,
  session_id TEXT NOT NULL,
  
  -- FSM State
  current_state TEXT,
  fsm_snapshot JSONB,
  is_paused BOOLEAN DEFAULT false,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  pause_timeout_at TIMESTAMPTZ,
  pause_fallback_action TEXT DEFAULT 'notify',
  
  -- Resultado
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Métricas
  total_latency_ms INT,
  total_cost_cents INT DEFAULT 0,
  cost_budget_cents INT,
  nodes_executed INT DEFAULT 0,
  total_tokens_in INT DEFAULT 0,
  total_tokens_out INT DEFAULT 0,
  
  -- Qualidade
  quality_score NUMERIC(3,2),
  eval_details JSONB,
  user_satisfaction_score INT,
  
  -- Error tracking
  error_code TEXT,
  error_message TEXT,
  error_node_id UUID,
  retry_count INT DEFAULT 0,
  
  -- Idempotency
  idempotency_key TEXT UNIQUE,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see executions of own flows"
  ON public.agent_executions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()));

CREATE POLICY "System can insert executions"
  ON public.agent_executions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_executions_flow ON public.agent_executions(flow_id, started_at DESC);
CREATE INDEX idx_executions_session ON public.agent_executions(session_id);
CREATE INDEX idx_executions_status ON public.agent_executions(status) WHERE status IN ('running', 'paused');
CREATE INDEX idx_executions_tenant ON public.agent_executions(tenant_id);

-- 5. agent_execution_steps — Trace por Nó
CREATE TABLE public.agent_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  node_id UUID,
  node_type TEXT NOT NULL,
  step_order INT NOT NULL,
  
  input_data JSONB,
  output_data JSONB,
  
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  latency_ms INT,
  cost_cents INT DEFAULT 0,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  
  tool_name TEXT,
  tool_idempotency_key TEXT,
  tool_retries INT DEFAULT 0,
  
  status TEXT DEFAULT 'running',
  error_message TEXT,
  compensation_action TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_execution_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see steps of own executions"
  ON public.agent_execution_steps FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_executions ae
    JOIN public.agent_flows af ON ae.flow_id = af.id
    WHERE ae.id = execution_id AND af.user_id = auth.uid()
  ));

CREATE POLICY "System can insert steps"
  ON public.agent_execution_steps FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_steps_execution ON public.agent_execution_steps(execution_id, step_order);

-- 6. execution_dead_letter_queue — DLQ
CREATE TABLE public.execution_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES public.agent_executions(id),
  step_id UUID,
  
  error_code TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  node_type TEXT,
  node_config JSONB,
  input_data JSONB,
  
  fsm_snapshot JSONB,
  retry_count INT DEFAULT 0,
  
  resolution_status TEXT DEFAULT 'pending',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.execution_dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see DLQ of own flows"
  ON public.execution_dead_letter_queue FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_executions ae
    JOIN public.agent_flows af ON ae.flow_id = af.id
    WHERE ae.id = execution_id AND af.user_id = auth.uid()
  ));

CREATE INDEX idx_dlq_status ON public.execution_dead_letter_queue(resolution_status) WHERE resolution_status = 'pending';
