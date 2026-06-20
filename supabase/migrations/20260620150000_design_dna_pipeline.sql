-- Migration: design_dna extraction pipeline — fila, runs, checkpoints, eventos.
-- Replica a arquitetura testada do agent-run (Inngest queue + chunk/resume).
-- Diferencial: cada job tem dedicated sandbox com Playwright + Chromium.

-- 1. design_dna_jobs — status machine (como agent_runs)

CREATE TABLE IF NOT EXISTS design_dna_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','canceled')),
  depth TEXT NOT NULL DEFAULT 'deep'
    CHECK (depth IN ('shallow','deep')),
  categories TEXT[] NOT NULL DEFAULT '{hero,motion,typography,color_application,components,interactions}',
  urls TEXT[] NOT NULL DEFAULT '{}',
  current_url_index INT NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  sandbox_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  error TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_ddj_status ON design_dna_jobs (status, started_at DESC);
CREATE INDEX idx_ddj_user ON design_dna_jobs (user_id, started_at DESC);
CREATE INDEX idx_ddj_heartbeat ON design_dna_jobs (heartbeat_at) WHERE status = 'running';

ALTER TABLE design_dna_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ddj_select_own" ON design_dna_jobs
  FOR SELECT USING (user_id = auth.uid() OR auth.role() = 'service_role');
CREATE POLICY "ddj_insert_service" ON design_dna_jobs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ddj_update_service" ON design_dna_jobs
  FOR UPDATE USING (auth.role() = 'service_role');

-- 2. design_dna_job_queue — fila FIFO (como agent_pending_messages)

CREATE TABLE IF NOT EXISTS design_dna_job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ddjq_created ON design_dna_job_queue (created_at);

ALTER TABLE design_dna_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ddjq_select_own" ON design_dna_job_queue
  FOR SELECT USING (user_id = auth.uid() OR auth.role() = 'service_role');
CREATE POLICY "ddjq_insert_service" ON design_dna_job_queue
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ddjq_delete_service" ON design_dna_job_queue
  FOR DELETE USING (auth.role() = 'service_role');

-- 3. design_dna_checkpoints — progresso retomável (como agent_checkpoints)

CREATE TABLE IF NOT EXISTS design_dna_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES design_dna_jobs(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

CREATE INDEX idx_ddc_job ON design_dna_checkpoints (job_id);

ALTER TABLE design_dna_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ddc_select_service" ON design_dna_checkpoints
  FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "ddc_insert_service" ON design_dna_checkpoints
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ddc_update_service" ON design_dna_checkpoints
  FOR UPDATE USING (auth.role() = 'service_role');

-- 4. design_dna_events — streaming em tempo real (como agent_stream_events)

CREATE TABLE IF NOT EXISTS design_dna_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES design_dna_jobs(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, seq)
);

CREATE INDEX idx_dde_job_seq ON design_dna_events (job_id, seq);

ALTER TABLE design_dna_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dde_select_own" ON design_dna_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM design_dna_jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
    OR auth.role() = 'service_role'
  );
CREATE POLICY "dde_insert_service" ON design_dna_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- 5. Trigger updated_at para checkpoints

CREATE OR REPLACE FUNCTION touch_design_dna_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ddc_updated_at
  BEFORE UPDATE ON design_dna_checkpoints
  FOR EACH ROW EXECUTE FUNCTION touch_design_dna_updated_at();

-- 6. Grants

GRANT SELECT ON design_dna_jobs TO authenticated;
GRANT ALL ON design_dna_jobs TO service_role;

GRANT SELECT, INSERT, DELETE ON design_dna_job_queue TO authenticated;
GRANT ALL ON design_dna_job_queue TO service_role;

GRANT SELECT, INSERT, UPDATE ON design_dna_checkpoints TO authenticated;
GRANT ALL ON design_dna_checkpoints TO service_role;

GRANT SELECT ON design_dna_events TO authenticated;
GRANT ALL ON design_dna_events TO service_role;

-- 7. Realtime (para UI acompanhar progresso)

ALTER PUBLICATION supabase_realtime ADD TABLE design_dna_jobs;
ALTER TABLE design_dna_jobs REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE design_dna_events;
ALTER TABLE design_dna_events REPLICA IDENTITY FULL;
