-- Permite Groq + NVIDIA + xAI + OpenAI ao mesmo tempo (ROBIN / API Keys).
-- Antes: UNIQUE (owner_id, kind) — só uma linha openai por usuário.

ALTER TABLE public.connectors
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT '';

-- Backfill provider a partir de meta (openai-compatible)
UPDATE public.connectors
SET provider = COALESCE(NULLIF(meta->>'provider', ''), 'openai')
WHERE kind = 'openai' AND (provider = '' OR provider IS NULL);

UPDATE public.connectors
SET provider = ''
WHERE kind <> 'openai';

-- Remove constraint antiga
ALTER TABLE public.connectors
  DROP CONSTRAINT IF EXISTS connectors_owner_id_kind_key;

-- Uma linha por (usuário, kind, provider): github/anthropic usam provider ''
ALTER TABLE public.connectors
  ADD CONSTRAINT connectors_owner_id_kind_provider_key
  UNIQUE (owner_id, kind, provider);

CREATE INDEX IF NOT EXISTS connectors_openai_provider_idx
  ON public.connectors (owner_id, provider)
  WHERE kind = 'openai';

-- View pública: recriar (CREATE OR REPLACE não permite mudar ordem/nome de colunas)
DROP VIEW IF EXISTS public.connectors_public;

CREATE VIEW public.connectors_public
  WITH (security_invoker = true) AS
  SELECT id, owner_id, kind, provider, meta, created_at, updated_at
  FROM public.connectors;

GRANT SELECT ON public.connectors_public TO authenticated;