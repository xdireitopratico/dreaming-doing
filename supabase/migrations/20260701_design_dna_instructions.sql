-- design_dna_instructions: user instructions injected into a running browser agent.

CREATE TABLE IF NOT EXISTS public.design_dna_instructions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.design_dna_jobs(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'system')),
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_design_dna_instructions_job_status
    ON public.design_dna_instructions(job_id, status);

-- Enable RLS
ALTER TABLE public.design_dna_instructions ENABLE ROW LEVEL SECURITY;

-- Users can view instructions for jobs they own
CREATE POLICY "Users can view own instructions"
    ON public.design_dna_instructions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.design_dna_jobs j
            WHERE j.id = design_dna_instructions.job_id
              AND j.user_id = auth.uid()
        )
    );

-- Users can insert instructions for jobs they own
CREATE POLICY "Users can insert own instructions"
    ON public.design_dna_instructions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.design_dna_jobs j
            WHERE j.id = design_dna_instructions.job_id
              AND j.user_id = auth.uid()
        )
    );

-- Service role / backend functions can update status
CREATE POLICY "Service role can update instruction status"
    ON public.design_dna_instructions
    FOR UPDATE
    USING (
        (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
    );

-- Realtime publication (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.design_dna_instructions;
