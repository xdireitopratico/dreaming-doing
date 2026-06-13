-- T01: BYOK columns for tenant_secrets (vibrant 20260314173338)
-- SecretsPanel no editor do agente usa estas colunas.

ALTER TABLE public.tenant_secrets
  ADD COLUMN IF NOT EXISTS provider_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_platform_provided BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS secret_type TEXT DEFAULT 'api_key',
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_secrets_provider
  ON public.tenant_secrets (tenant_id, provider_id);

COMMENT ON COLUMN public.tenant_secrets.provider_id IS 'Linked provider ID (e.g. anthropic, openai, groq)';
COMMENT ON COLUMN public.tenant_secrets.is_platform_provided IS 'Whether this key is provided by the platform vs BYOK';
COMMENT ON COLUMN public.tenant_secrets.secret_type IS 'Type: api_key, oauth_token, webhook_secret';
COMMENT ON COLUMN public.tenant_secrets.description IS 'Human-readable description of what this secret is for';