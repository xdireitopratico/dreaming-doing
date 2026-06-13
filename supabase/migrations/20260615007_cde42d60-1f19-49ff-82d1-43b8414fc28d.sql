
-- agent_schedules: Agendamentos de execução automática de agentes
CREATE TABLE public.agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Schedule',
  cron_expression TEXT NOT NULL DEFAULT '0 * * * *',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  input_payload JSONB DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_schedules_flow_id ON public.agent_schedules(flow_id);
CREATE INDEX idx_agent_schedules_user_id ON public.agent_schedules(user_id);
CREATE INDEX idx_agent_schedules_active ON public.agent_schedules(is_active, next_run_at);

-- RLS
ALTER TABLE public.agent_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedules"
  ON public.agent_schedules FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Flow members can view schedules
CREATE POLICY "Members can view shared schedules"
  ON public.agent_schedules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_flow_members
      WHERE agent_flow_members.flow_id = agent_schedules.flow_id
      AND agent_flow_members.user_id = auth.uid()
    )
  );
