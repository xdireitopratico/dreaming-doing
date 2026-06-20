-- Migration: Cria tabela design_dna para armazenar DNA extraído de sites de referência.
-- Usada pelo scheduler semanal e pelo extract-design-dna edge function.

CREATE TABLE IF NOT EXISTS design_dna (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'full_page',
  serves_domains TEXT[] DEFAULT '{}',
  compatible_languages TEXT[] DEFAULT '{}',
  compatible_moods TEXT[] DEFAULT '{}',
  layout JSONB DEFAULT NULL,
  color JSONB DEFAULT NULL,
  typography JSONB DEFAULT NULL,
  motion JSONB DEFAULT NULL,
  interaction JSONB DEFAULT NULL,
  component JSONB DEFAULT NULL,
  quality_score INTEGER DEFAULT 5,
  quality_source TEXT DEFAULT 'heuristic',
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_design_dna_category ON design_dna (category);
CREATE INDEX IF NOT EXISTS idx_design_dna_quality ON design_dna (quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_design_dna_source ON design_dna (source_url);
CREATE INDEX IF NOT EXISTS idx_design_dna_extracted ON design_dna (extracted_at DESC);

-- RLS: leitura pública, escrita apenas service_role
ALTER TABLE design_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "design_dna_select_public" ON design_dna
  FOR SELECT USING (TRUE);

CREATE POLICY "design_dna_insert_service" ON design_dna
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "design_dna_update_service" ON design_dna
  FOR UPDATE USING (auth.role() = 'service_role');

-- Função para carregar design_dna no catálogo do agente
CREATE OR REPLACE FUNCTION get_design_dna_catalog(
  limit_count INTEGER DEFAULT 50,
  min_quality INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
  FROM (
    SELECT * FROM design_dna
    WHERE quality_score >= min_quality
    ORDER BY quality_score DESC, extracted_at DESC
    LIMIT limit_count
  ) d
$$;

COMMENT ON FUNCTION get_design_dna_catalog IS 'Retorna catálogo de DesignDNA para injeção no prompt do agente.';
