-- Code Corpus: snapshots de código gerado pelo agente (service role only, sem RLS de usuário)

CREATE TABLE IF NOT EXISTS public.code_corpus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id UUID NOT NULL,
  source_user_id UUID,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_hash TEXT,
  stack_kind TEXT,
  capture_reason TEXT NOT NULL DEFAULT 'agent_write',
  run_id UUID,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.code_corpus IS
  'Arquivo de treino/fine-tuning: snapshots de código gerado pelo agente ou preservados no delete do projeto. Acesso apenas service_role.';

CREATE INDEX IF NOT EXISTS code_corpus_project_idx ON public.code_corpus (source_project_id);
CREATE INDEX IF NOT EXISTS code_corpus_captured_at_idx ON public.code_corpus (captured_at DESC);
CREATE INDEX IF NOT EXISTS code_corpus_path_idx ON public.code_corpus (path);
CREATE INDEX IF NOT EXISTS code_corpus_run_idx ON public.code_corpus (run_id) WHERE run_id IS NOT NULL;

ALTER TABLE public.code_corpus ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.code_corpus TO service_role;