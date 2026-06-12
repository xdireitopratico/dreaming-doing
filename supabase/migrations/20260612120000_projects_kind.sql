-- Discrimina projetos de site (app) vs fluxos AetherForge (agent)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'app'
  CHECK (kind IN ('app', 'agent'));

CREATE INDEX IF NOT EXISTS projects_owner_kind_updated_idx
  ON public.projects (owner_id, kind, updated_at DESC);