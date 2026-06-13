-- T04: quality_model + fallback_model_id em prometheus_build_sessions
-- vibrant 20260315032249 + 20260318190508
-- Persiste modelo do power selector (não é chave API).

ALTER TABLE public.prometheus_build_sessions
  ADD COLUMN IF NOT EXISTS quality_model TEXT NOT NULL DEFAULT '';

ALTER TABLE public.prometheus_build_sessions
  ADD COLUMN IF NOT EXISTS fallback_model_id TEXT;

COMMENT ON COLUMN public.prometheus_build_sessions.quality_model IS
  'Primary LLM model selected in the power selector (e.g. groq/llama-3.3-70b).';
COMMENT ON COLUMN public.prometheus_build_sessions.fallback_model_id IS
  'Optional fallback model when primary quality_model is unavailable.';