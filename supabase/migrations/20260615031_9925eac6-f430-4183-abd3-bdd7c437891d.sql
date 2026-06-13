
CREATE TABLE public.agent_tools (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    input_schema JSONB NOT NULL DEFAULT '{"type":"object","properties":{},"required":[]}',
    executor_type TEXT NOT NULL DEFAULT 'code_execute',
    code TEXT,
    endpoint TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    created_by TEXT DEFAULT 'lara',
    category TEXT DEFAULT 'custom',
    idempotent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_tools"
ON public.agent_tools
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated read agent_tools"
ON public.agent_tools
FOR SELECT
TO authenticated
USING (true);

COMMENT ON TABLE public.agent_tools IS 'Dynamic tool registry — tools created by Lara at runtime, loaded on agent loop boot';
