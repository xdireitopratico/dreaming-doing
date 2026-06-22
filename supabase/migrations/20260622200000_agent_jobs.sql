-- Fase 1: fila explícita de chunks (agent_jobs) — um job = uma execução Inngest.

CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  generation INT NOT NULL DEFAULT 1 CHECK (generation >= 1),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'completed', 'failed', 'canceled')),
  lease_until TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT agent_jobs_run_generation_unique UNIQUE (run_id, generation)
);

CREATE INDEX IF NOT EXISTS agent_jobs_run_status_idx
  ON public.agent_jobs(run_id, status, generation);

CREATE INDEX IF NOT EXISTS agent_jobs_lease_until_idx
  ON public.agent_jobs(lease_until)
  WHERE status = 'leased';

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_jobs_select_own" ON public.agent_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.id = agent_jobs.run_id AND r.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.agent_jobs TO authenticated;
GRANT ALL ON public.agent_jobs TO service_role;

COMMENT ON TABLE public.agent_jobs IS
  'Fila de chunks do agent run — uma linha por geração (Inngest step).';