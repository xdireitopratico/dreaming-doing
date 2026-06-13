CREATE TABLE public.prometheus_build_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    intent TEXT NOT NULL DEFAULT 'create',
    phase TEXT NOT NULL DEFAULT 'discovery',
    messages JSONB DEFAULT '[]',
    requirements JSONB,
    architecture JSONB,
    flow_definition JSONB,
    prompts JSONB,
    test_suite JSONB,
    test_results JSONB,
    target_flow_id UUID REFERENCES public.agent_flows(id),
    iterations INT DEFAULT 0,
    build_time_seconds FLOAT,
    specialist_calls JSONB DEFAULT '[]',
    output_flow_id UUID REFERENCES public.agent_flows(id),
    success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.prometheus_build_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own build sessions"
ON public.prometheus_build_sessions
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());