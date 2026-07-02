-- design_dna_captures: qualified viewport captures (Storage-backed, no base64 in agent state).

CREATE TABLE IF NOT EXISTS public.design_dna_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.design_dna_jobs(id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    page_index INT NOT NULL DEFAULT 0,
    segment_index INT NOT NULL DEFAULT 0,
    scroll_y INT NOT NULL DEFAULT 0,
    viewport_label TEXT NOT NULL DEFAULT 'desktop',
    section_type TEXT NOT NULL DEFAULT 'unknown',
    label TEXT NOT NULL DEFAULT 'capture',
    selector TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    thumb_path TEXT NOT NULL,
    byte_size INT NOT NULL DEFAULT 0,
    meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_dna_captures_job
    ON public.design_dna_captures(job_id, segment_index);

ALTER TABLE public.design_dna_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own captures"
    ON public.design_dna_captures
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.design_dna_jobs j
            WHERE j.id = design_dna_captures.job_id
              AND j.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role manages captures"
    ON public.design_dna_captures
    FOR ALL
    USING (
        (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
    )
    WITH CHECK (
        (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
    );

-- Storage bucket (private — signed URLs for UI / LLM thumbs later)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'design-dna-captures',
    'design-dna-captures',
    false,
    10485760,
    ARRAY['image/png', 'image/webp', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Service role upload design dna captures" ON storage.objects;
CREATE POLICY "Service role upload design dna captures"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'design-dna-captures'
        AND (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
    );

DROP POLICY IF EXISTS "Users read own design dna captures" ON storage.objects;
CREATE POLICY "Users read own design dna captures"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'design-dna-captures'
        AND (
            (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
            OR EXISTS (
                SELECT 1 FROM public.design_dna_jobs j
                WHERE j.id::text = (storage.foldername(name))[2]
                  AND j.user_id = auth.uid()
            )
        )
    );

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.design_dna_captures;