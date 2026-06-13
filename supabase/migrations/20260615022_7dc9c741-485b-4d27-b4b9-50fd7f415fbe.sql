-- P21: Embeddings Pipeline — Índices vetoriais + RPCs

-- 1. IVFFlat index on rag_chunks (cosine distance)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding 
ON public.rag_chunks USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- 2. Add embedding column to codex_genomes for semantic genome search
ALTER TABLE public.codex_genomes ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);

CREATE INDEX IF NOT EXISTS idx_codex_genomes_embedding 
ON public.codex_genomes USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 10);

-- 3. RPC: search_rag_chunks — vector similarity search with tenant isolation
CREATE OR REPLACE FUNCTION public.search_rag_chunks(
  p_tenant_id UUID,
  p_embedding extensions.vector(768),
  p_match_threshold FLOAT DEFAULT 0.5,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  heading TEXT,
  chunk_index INT,
  page_number INT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT 
    rc.id,
    rc.document_id,
    rc.content,
    rc.heading,
    rc.chunk_index,
    rc.page_number,
    1 - (rc.embedding <=> p_embedding) AS similarity
  FROM rag_chunks rc
  WHERE rc.tenant_id = p_tenant_id
    AND rc.embedding IS NOT NULL
    AND 1 - (rc.embedding <=> p_embedding) > p_match_threshold
  ORDER BY rc.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

-- 4. RPC: search_codex_genomes — find similar genomes by semantic embedding
CREATE OR REPLACE FUNCTION public.search_codex_genomes(
  p_embedding extensions.vector(768),
  p_match_threshold FLOAT DEFAULT 0.4,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  genome_key TEXT,
  name TEXT,
  description TEXT,
  domain TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT 
    cg.id,
    cg.genome_key,
    cg.name,
    cg.description,
    cg.domain,
    1 - (cg.embedding <=> p_embedding) AS similarity
  FROM codex_genomes cg
  WHERE cg.embedding IS NOT NULL
    AND cg.is_active = true
    AND 1 - (cg.embedding <=> p_embedding) > p_match_threshold
  ORDER BY cg.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

-- search_knowledge_base_vector omitido no FORGE (tabela company_knowledge_base é domínio vibrant)