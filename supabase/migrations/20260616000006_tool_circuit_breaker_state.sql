-- T06: Circuit breaker state persistence (vibrant 20260315212744)
-- tool-executor persiste estado via service_role.

CREATE TABLE IF NOT EXISTS public.tool_circuit_breaker_state (
    tool_name TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
    failures INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS policies — only accessed via service_role from edge functions
ALTER TABLE public.tool_circuit_breaker_state ENABLE ROW LEVEL SECURITY;