
-- ============================================
-- AetherForge: Tools, Secrets, Prompts, RAG, Cache, Webhooks, Testes (Bloco 3)
-- ============================================

-- 7. tool_registry — Registro Universal de Tools
CREATE TABLE public.tool_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  icon TEXT,
  
  input_schema JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB NOT NULL DEFAULT '{}',
  
  executor_type TEXT NOT NULL DEFAULT 'http',
  executor_config JSONB NOT NULL DEFAULT '{}',
  
  required_secrets TEXT[] DEFAULT '{}',
  sandbox_level TEXT DEFAULT 'standard',
  requires_idempotency BOOLEAN DEFAULT false,
  
  circuit_breaker_threshold INT DEFAULT 5,
  circuit_breaker_timeout_seconds INT DEFAULT 60,
  rate_limit_per_minute INT,
  rate_limit_per_tenant_per_minute INT,
  
  is_builtin BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tool_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active tools"
  ON public.tool_registry FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 8. tenant_secrets — Secrets por Tenant
CREATE TABLE public.tenant_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  secret_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  encryption_key_id TEXT NOT NULL DEFAULT 'default',
  
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  rotation_reminder_sent BOOLEAN DEFAULT false,
  
  last_accessed_at TIMESTAMPTZ,
  access_count BIGINT DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tenant_id, secret_name)
);

ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants manage own secrets"
  ON public.tenant_secrets FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- 9. prompt_store — Prompt Management Versionado
CREATE TABLE public.prompt_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  
  system_prompt TEXT NOT NULL,
  template_variables JSONB DEFAULT '[]',
  
  version INT DEFAULT 1,
  parent_version_id UUID,
  is_active BOOLEAN DEFAULT true,
  
  ab_group TEXT,
  ab_experiment_id UUID,
  ab_traffic_percent INT DEFAULT 100,
  
  avg_quality_score NUMERIC(3,2),
  total_uses BIGINT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(slug, version)
);

ALTER TABLE public.prompt_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prompts"
  ON public.prompt_store FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 10. agent_test_suites — Framework de Testes
CREATE TABLE public.agent_test_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  
  test_cases JSONB NOT NULL DEFAULT '[]',
  
  last_run_at TIMESTAMPTZ,
  last_run_passed INT DEFAULT 0,
  last_run_failed INT DEFAULT 0,
  last_run_quality_avg NUMERIC(3,2),
  
  baseline_version INT,
  regression_detected BOOLEAN DEFAULT false,
  regression_details JSONB,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_test_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage tests of own flows"
  ON public.agent_test_suites FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid()));

-- 11. rag_documents — Pipeline de Ingestão RAG
CREATE TABLE public.rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  flow_id UUID,
  
  source_type TEXT NOT NULL DEFAULT 'upload',
  source_url TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  storage_path TEXT,
  
  processing_status TEXT DEFAULT 'pending',
  chunk_strategy TEXT DEFAULT 'semantic',
  chunk_size INT DEFAULT 512,
  chunk_overlap INT DEFAULT 50,
  embedding_model TEXT DEFAULT 'nomic-embed-text',
  total_chunks INT,
  
  document_metadata JSONB DEFAULT '{}',
  last_indexed_at TIMESTAMPTZ,
  reindex_required BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants manage own documents"
  ON public.rag_documents FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- 12. rag_chunks — Chunks Vetorizados
CREATE TABLE public.rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding extensions.vector(768),
  
  heading TEXT,
  page_number INT,
  char_start INT,
  char_end INT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants access own chunks"
  ON public.rag_chunks FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE INDEX idx_rag_chunks_tenant ON public.rag_chunks(tenant_id);
CREATE INDEX idx_rag_chunks_document ON public.rag_chunks(document_id);

-- 13. semantic_cache — Cache Semântico de Outputs
CREATE TABLE public.semantic_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  flow_id UUID,
  
  input_embedding extensions.vector(768),
  input_text_hash TEXT NOT NULL,
  
  cached_response TEXT NOT NULL,
  response_quality_score NUMERIC(3,2),
  
  hit_count BIGINT DEFAULT 0,
  similarity_threshold NUMERIC(3,2) DEFAULT 0.92,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_hit_at TIMESTAMPTZ
);

ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants access own cache"
  ON public.semantic_cache FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- 14. webhook_inbox — Webhook Reliability Queue
CREATE TABLE public.webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT,
  
  headers JSONB,
  body JSONB NOT NULL,
  signature TEXT,
  signature_verified BOOLEAN,
  
  status TEXT DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  
  dedup_key TEXT UNIQUE,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhook_inbox ENABLE ROW LEVEL SECURITY;

-- Webhooks são gerenciados pelo sistema (service_role), não por usuários
-- Sem policy de acesso direto — acesso via Edge Functions com service_role

-- Índices
CREATE INDEX idx_webhook_inbox_status ON public.webhook_inbox(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_webhook_inbox_retry ON public.webhook_inbox(next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_rag_documents_tenant ON public.rag_documents(tenant_id);
CREATE INDEX idx_prompt_store_slug ON public.prompt_store(slug, version);
