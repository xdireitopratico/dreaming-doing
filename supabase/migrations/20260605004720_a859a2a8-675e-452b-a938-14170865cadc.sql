-- B8: Realtime channel policy for project_files (mirror editor-% pattern)
CREATE POLICY "authenticated can listen to own project_files channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'project_files-%')
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.owner_id = auth.uid()
      AND p.id::text = SUBSTRING(realtime.topic() FROM 16)
  )
);

-- B9: deployments — UPDATE + DELETE restricted to project owner
CREATE POLICY deploy_update_own ON public.deployments
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = deployments.project_id AND p.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = deployments.project_id AND p.owner_id = auth.uid()));

CREATE POLICY deploy_delete_own ON public.deployments
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = deployments.project_id AND p.owner_id = auth.uid()));

-- B10: user_roles — explicitly deny direct writes by authenticated role.
-- Only service_role (bypass RLS) can mutate. Prevents privilege escalation.
CREATE POLICY roles_no_insert ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY roles_no_update ON public.user_roles
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY roles_no_delete ON public.user_roles
FOR DELETE TO authenticated
USING (false);

-- B11: has_role is invoked only from RLS policy expressions (run as the policy's role,
-- which uses the function via the SQL planner). Revoke direct EXECUTE so signed-in users
-- cannot probe arbitrary (uid, role) pairs via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;