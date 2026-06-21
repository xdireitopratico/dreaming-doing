-- Migration: Chat sessions e mensagens persistidas para Design Library Browser Preview
-- Histórico navegável por job — admin (xdireitopratico@gmail.com) tem acesso total.

CREATE TABLE IF NOT EXISTS design_library_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES design_dna_jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS idx_dlcs_job ON design_library_chat_sessions (job_id);
CREATE INDEX IF NOT EXISTS idx_dlcs_user ON design_library_chat_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS design_library_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES design_library_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  actions JSONB DEFAULT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlcm_session ON design_library_chat_messages (session_id, created_at);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_dlcs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dlcs_updated_at
  BEFORE UPDATE ON design_library_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_dlcs_updated_at();

-- RLS: só admin
ALTER TABLE design_library_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_library_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlcs_admin_all" ON design_library_chat_sessions
  FOR ALL USING (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  );

CREATE POLICY "dlcm_admin_all" ON design_library_chat_messages
  FOR ALL USING (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE design_library_chat_messages;
ALTER TABLE design_library_chat_messages REPLICA IDENTITY FULL;
