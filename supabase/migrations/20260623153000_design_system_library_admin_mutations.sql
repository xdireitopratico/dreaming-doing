-- Allow the admin who can read the Design Library to also mutate it.
-- Without this, the UI can appear to succeed while PostgREST silently affects 0 rows.

GRANT UPDATE, DELETE ON public.design_system_library TO authenticated;
GRANT ALL ON public.design_system_library TO service_role;

DROP POLICY IF EXISTS "dsl_update_admin" ON public.design_system_library;
CREATE POLICY "dsl_update_admin" ON public.design_system_library
  FOR UPDATE TO authenticated
  USING (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  );

DROP POLICY IF EXISTS "dsl_delete_admin" ON public.design_system_library;
CREATE POLICY "dsl_delete_admin" ON public.design_system_library
  FOR DELETE TO authenticated
  USING (
    auth.role() = 'service_role'
    OR auth.jwt() ->> 'email' = 'xdireitopratico@gmail.com'
  );
