-- Migration: Democratize Design Library access — remove all admin-only gates.
-- Any authenticated user can read/write their own data.
-- service_role retains full access for edge functions / Inngest / cron.
--
-- Tables affected:
--   1. design_system_library  — SELECT all, INSERT/UPDATE/DELETE only own entries (via extracted_by)
--   2. design_library_chat_sessions — all operations by job owner or session user
--   3. design_library_chat_messages  — all operations by session owner

-- ────────────────────────────────────────────────────────────────────────
-- 1. design_system_library — from admin-only SELECT to authenticated SELECT
-- ────────────────────────────────────────────────────────────────────────

-- Drop old admin-only SELECT policy
DROP POLICY IF EXISTS "dsl_select_admin" ON design_system_library;
-- Drop old public SELECT (replaced with authenticated)
DROP POLICY IF EXISTS "dsl_select_public" ON design_system_library;

-- Any authenticated user can read
CREATE POLICY "dsl_select_authenticated" ON design_system_library
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Users can update their own extracted entries (validate, archive, add notes)
-- Service role can upsert from extraction pipeline
CREATE POLICY "dsl_update_own_or_service" ON design_system_library
  FOR UPDATE USING (
    extracted_by = auth.uid()
    OR auth.role() = 'service_role'
  ) WITH CHECK (
    extracted_by = auth.uid()
    OR auth.role() = 'service_role'
  );

-- Drop admin-only DELETE policy, replace with user-based
DROP POLICY IF EXISTS "dsl_delete_admin" ON design_system_library;

CREATE POLICY "dsl_delete_own_or_service" ON design_system_library
  FOR DELETE USING (
    extracted_by = auth.uid()
    OR auth.role() = 'service_role'
  );

-- Keep existing service_role insert policy (edge functions upsert)
-- INSERT stays service_role only — pipeline creates entries

-- ────────────────────────────────────────────────────────────────────────
-- 2. design_library_chat_sessions — from admin-only to job owner / session user
-- ────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "dlcs_admin_all" ON design_library_chat_sessions;

-- Users can read sessions for their own jobs
CREATE POLICY "dlcs_select_own" ON design_library_chat_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM design_dna_jobs j
      WHERE j.id = job_id AND (j.user_id = auth.uid() OR auth.role() = 'service_role')
    )
    OR user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- Service role can insert (edge function creates sessions)
CREATE POLICY "dlcs_insert_service" ON design_library_chat_sessions
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Service role can update
CREATE POLICY "dlcs_update_service" ON design_library_chat_sessions
  FOR UPDATE USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- 3. design_library_chat_messages — from admin-only to session-based access
-- ────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "dlcm_admin_all" ON design_library_chat_messages;

-- Users can read messages from their own sessions
CREATE POLICY "dlcm_select_own" ON design_library_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM design_library_chat_sessions s
      JOIN design_dna_jobs j ON j.id = s.job_id
      WHERE s.id = session_id
        AND (j.user_id = auth.uid() OR s.user_id = auth.uid() OR auth.role() = 'service_role')
    )
  );

-- Service role inserts messages (edge function persists chat)
CREATE POLICY "dlcm_insert_service" ON design_library_chat_messages
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- 4. User metrics RPC — count jobs, entries, usage per user
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION design_library_user_metrics(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  target_uid UUID;
  job_count BIGINT;
  entry_count BIGINT;
  total_quality NUMERIC;
  validated_count BIGINT;
  recent_jobs JSONB;
BEGIN
  target_uid := COALESCE(p_user_id, auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);

  SELECT COUNT(*) INTO job_count
  FROM design_dna_jobs
  WHERE user_id = target_uid;

  SELECT COUNT(*), COALESCE(AVG(quality_score), 0)::NUMERIC(4,1), COUNT(*) FILTER (WHERE validated = TRUE)
  INTO entry_count, total_quality, validated_count
  FROM design_system_library
  WHERE extracted_by = target_uid;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO recent_jobs
  FROM (
    SELECT id, status, depth, categories, created_at, finished_at, error
    FROM design_dna_jobs
    WHERE user_id = target_uid
    ORDER BY created_at DESC
    LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'userId', target_uid,
    'jobCount', job_count,
    'entryCount', entry_count,
    'avgQuality', total_quality,
    'validatedCount', validated_count,
    'recentJobs', recent_jobs
  );
END;
$$;

COMMENT ON FUNCTION design_library_user_metrics IS 'Retorna métricas de uso da Design Library para um usuário específico (ou o usuário autenticado).';
