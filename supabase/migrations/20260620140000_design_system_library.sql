-- Migration: Cria design_system_library — biblioteca curada de referências de design.
--
-- Cada entrada tem "lastro" (proveniência completa): quem extraiu, de onde, quando,
-- qual a qualidade. O raw_markdown + screenshot_url permitem que o LLM consulte
-- o conteúdo original. O design_dna JSONB guarda a estrutura extraída.
-- O embedding vector permite busca semântica futura.
--
-- Diferente da tabela design_dna (que é temporária/automática), esta biblioteca
-- é curada — entradas podem ser validadas, taggeadas e organizadas como
-- um acervo de Design System.

-- Extensão para vetores (necessário para embedding)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS design_system_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'full_page',

  -- Proveniência (lastro)
  extracted_by UUID REFERENCES auth.users(id),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quality_score INTEGER NOT NULL DEFAULT 5
    CHECK (quality_score >= 0 AND quality_score <= 10),
  quality_source TEXT NOT NULL DEFAULT 'heuristic',
  validated BOOLEAN NOT NULL DEFAULT FALSE,
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,

  -- Conteúdo bruto (para consulta do LLM)
  raw_markdown TEXT,
  screenshot_url TEXT,
  screenshot_base64 TEXT,

  -- DNA estruturado
  design_dna JSONB DEFAULT NULL,

  -- Organização
  serves_domains TEXT[] NOT NULL DEFAULT '{}',
  compatible_languages TEXT[] NOT NULL DEFAULT '{}',
  compatible_moods TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Estado
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  view_count INTEGER NOT NULL DEFAULT 0,

  -- Embedding para busca semântica (futuro)
  embedding extensions.vector(1536),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dsl_category ON design_system_library (category);
CREATE INDEX IF NOT EXISTS idx_dsl_quality ON design_system_library (quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_dsl_source ON design_system_library (source_url);
CREATE INDEX IF NOT EXISTS idx_dsl_extracted ON design_system_library (extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsl_validated ON design_system_library (validated) WHERE validated = TRUE;
CREATE INDEX IF NOT EXISTS idx_dsl_tags ON design_system_library USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_dsl_embedding ON design_system_library
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- RLS: leitura pública, escrita apenas service_role
ALTER TABLE design_system_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsl_select_public" ON design_system_library
  FOR SELECT USING (TRUE);

CREATE POLICY "dsl_insert_service" ON design_system_library
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "dsl_update_service" ON design_system_library
  FOR UPDATE USING (auth.role() = 'service_role');

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_dsl_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dsl_updated_at
  BEFORE UPDATE ON design_system_library
  FOR EACH ROW
  EXECUTE FUNCTION update_dsl_updated_at();

-- Função para buscar na biblioteca (usada pelo agente)
CREATE OR REPLACE FUNCTION search_design_library(
  query_domain TEXT DEFAULT NULL,
  query_mood TEXT DEFAULT NULL,
  query_language TEXT DEFAULT NULL,
  query_category TEXT DEFAULT NULL,
  query_tags TEXT[] DEFAULT NULL,
  min_quality INTEGER DEFAULT 5,
  limit_count INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH filtered AS (
    SELECT * FROM design_system_library
    WHERE is_archived = FALSE
      AND quality_score >= min_quality
      AND (query_domain IS NULL OR serves_domains && ARRAY[query_domain])
      AND (query_mood IS NULL OR compatible_moods && ARRAY[query_mood])
      AND (query_language IS NULL OR compatible_languages && ARRAY[query_language])
      AND (query_category IS NULL OR category = query_category)
      AND (query_tags IS NULL OR tags && query_tags)
    ORDER BY quality_score DESC, extracted_at DESC
    LIMIT limit_count
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO result
  FROM (
    SELECT
      id, name, source_url, category,
      quality_score, quality_source,
      validated, extracted_at,
      serves_domains, compatible_languages, compatible_moods, tags,
      design_dna,
      notes, view_count
    FROM filtered
  ) f;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION search_design_library IS 'Busca referências na biblioteca de Design System por domínio, mood, linguagem, categoria ou tags.';

-- Função para busca semântica (quando embedding disponível)
CREATE OR REPLACE FUNCTION search_design_library_semantic(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  min_quality INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO result
  FROM (
    SELECT
      id, name, source_url, category,
      quality_score, quality_source,
      validated, extracted_at,
      serves_domains, compatible_languages, compatible_moods, tags,
      design_dna,
      notes, view_count,
      1 - (embedding <=> query_embedding) AS similarity
    FROM design_system_library
    WHERE is_archived = FALSE
      AND quality_score >= min_quality
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count
  ) s;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION search_design_library_semantic IS 'Busca semântica na biblioteca usando embedding vector. Requer pgvector.';

-- Migração: copia dados existentes da design_dna (se houver)
INSERT INTO design_system_library (
  name, source_url, category,
  quality_score, quality_source, extracted_at, validated,
  serves_domains, compatible_languages, compatible_moods,
  design_dna
)
SELECT
  name, source_url, category,
  quality_score, quality_source, extracted_at, validated,
  serves_domains, compatible_languages, compatible_moods,
  jsonb_build_object(
    'layout', layout,
    'color', color,
    'typography', typography,
    'motion', motion,
    'interaction', interaction,
    'component', component
  )
FROM design_dna
WHERE source_url IS NOT NULL
ON CONFLICT DO NOTHING;
