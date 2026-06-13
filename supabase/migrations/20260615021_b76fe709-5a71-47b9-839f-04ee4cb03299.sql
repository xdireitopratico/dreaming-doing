
-- P13: Physician tables for auto-healing diagnostics

-- Config table: per-flow healing settings
CREATE TABLE public.prometheus_auto_heal_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT false,
  check_interval_minutes INT DEFAULT 5,
  error_spike_threshold FLOAT DEFAULT 0.3,
  quality_drop_threshold FLOAT DEFAULT 0.2,
  latency_spike_threshold_ms INT DEFAULT 5000,
  max_auto_corrections INT DEFAULT 3,
  shadow_mode BOOLEAN DEFAULT true,
  allowed_treatments TEXT[] DEFAULT ARRAY['prompt_rewrite', 'model_switch', 'timeout_adjust', 'cache_clear', 'rollback'],
  notify_on_heal BOOLEAN DEFAULT true,
  notify_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL
);

ALTER TABLE public.prometheus_auto_heal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own heal configs"
ON public.prometheus_auto_heal_config
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX idx_heal_config_flow ON public.prometheus_auto_heal_config (flow_id);

-- Healing log: every diagnostic + treatment attempt
CREATE TABLE public.prometheus_healing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL,
  config_id UUID REFERENCES public.prometheus_auto_heal_config(id) ON DELETE SET NULL,
  symptom TEXT NOT NULL,
  symptom_data JSONB DEFAULT '{}',
  diagnosis TEXT,
  root_cause TEXT,
  severity TEXT DEFAULT 'medium',
  treatment_applied TEXT,
  treatment_data JSONB DEFAULT '{}',
  outcome TEXT DEFAULT 'pending',
  metrics_before JSONB DEFAULT '{}',
  metrics_after JSONB DEFAULT '{}',
  shadow_result JSONB,
  auto_rollback BOOLEAN DEFAULT false,
  model_used TEXT,
  diagnosis_latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  user_id UUID NOT NULL
);

ALTER TABLE public.prometheus_healing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own healing logs"
ON public.prometheus_healing_log
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_healing_log_flow ON public.prometheus_healing_log (flow_id, created_at DESC);
CREATE INDEX idx_healing_log_symptom ON public.prometheus_healing_log (symptom, created_at DESC);
