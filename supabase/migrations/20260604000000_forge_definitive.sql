-- Migration: embeddings + skills + rls_audit para o FORGE definitivo
-- Adiciona tabelas para RAG context assembly e skill marketplace

-- Embeddings cache (para RAG context assembly)
CREATE TABLE IF NOT EXISTS public.file_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  embedding VECTOR(1536),
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, file_path)
);

CREATE INDEX IF NOT EXISTS file_embeddings_project_idx ON public.file_embeddings(project_id);
CREATE INDEX IF NOT EXISTS file_embeddings_vector_idx ON public.file_embeddings USING ivfflat (embedding vector_cosine_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_embeddings TO authenticated;
GRANT ALL ON public.file_embeddings TO service_role;

ALTER TABLE public.file_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embeddings_select_own" ON public.file_embeddings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

CREATE POLICY "embeddings_insert_own" ON public.file_embeddings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Skill registry (marketplace de skills)
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  description TEXT NOT NULL,
  system_prompt TEXT,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  validate_trigger TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  installs INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name, version)
);

CREATE INDEX IF NOT EXISTS skills_public_idx ON public.skills(is_public, installs DESC);

GRANT SELECT ON public.skills TO authenticated;
GRANT ALL ON public.skills TO service_role;

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_select_public" ON public.skills FOR SELECT TO authenticated USING (is_public = true);
CREATE POLICY "skills_select_own" ON public.skills FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- Project skills (skills ativadas por projeto)
CREATE TABLE IF NOT EXISTS public.project_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, skill_id)
);

CREATE INDEX IF NOT EXISTS project_skills_project_idx ON public.project_skills(project_id);

GRANT SELECT, INSERT, DELETE ON public.project_skills TO authenticated;
GRANT ALL ON public.project_skills TO service_role;

ALTER TABLE public.project_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_select_own" ON public.project_skills FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

CREATE POLICY "ps_insert_own" ON public.project_skills FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Enable pgvector extension (required for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Trigger for skills updated_at
CREATE TRIGGER skills_touch BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
