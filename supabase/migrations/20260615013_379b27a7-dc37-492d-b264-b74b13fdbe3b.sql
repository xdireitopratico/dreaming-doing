
-- Round 42: Add missing columns to semantic_cache + increment function
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS input_hash TEXT;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS response_text TEXT;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS quality_score REAL DEFAULT 0.85;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS similarity_score REAL DEFAULT 1.0;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS tokens_saved INTEGER DEFAULT 0;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS cost_saved_cents REAL DEFAULT 0;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS flow_version INTEGER DEFAULT 1;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS input_text TEXT;
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS model_id TEXT;

-- Index for fast hash lookup
CREATE INDEX IF NOT EXISTS idx_semantic_cache_hash ON public.semantic_cache(flow_id, input_hash);

-- Unique constraint for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_cache_flow_hash ON public.semantic_cache(flow_id, input_hash);

-- Increment hit count function
CREATE OR REPLACE FUNCTION public.increment_cache_hit(cache_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.semantic_cache
  SET hit_count = COALESCE(hit_count, 0) + 1
  WHERE id = cache_id;
$$;
