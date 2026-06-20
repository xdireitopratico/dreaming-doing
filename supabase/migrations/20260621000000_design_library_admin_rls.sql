-- Migration: Admin-only access to design_system_library
-- Only the admin (xdireitopratico@gmail.com) can read entries.
-- service_role bypasses for edge functions and cron jobs.

DROP POLICY IF EXISTS "dsl_select_public" ON design_system_library;

CREATE POLICY "dsl_select_admin" ON design_system_library
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  );
