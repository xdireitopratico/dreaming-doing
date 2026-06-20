-- Migration: Adiciona design_signature em projects para memória anti-repetição.
-- Permite que o agente saiba qual direção de design foi usada anteriormente
-- e force variação entre builds do mesmo projeto.

-- Adiciona coluna design_signature na tabela projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS design_signature JSONB DEFAULT NULL;

-- Comentário descritivo
COMMENT ON COLUMN projects.design_signature IS 'Registro da última direção de design usada (voice, mood, techniques, moment). Usado para anti-repetição entre builds.';

-- Índice para consulta rápida
CREATE INDEX IF NOT EXISTS idx_projects_design_signature
  ON projects (id, design_signature)
  WHERE design_signature IS NOT NULL;
