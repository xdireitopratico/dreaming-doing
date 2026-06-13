
-- =====================================================
-- ITEM 3: Harden agent_versions RLS policies
-- =====================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Users can view own agent versions" ON public.agent_versions;
DROP POLICY IF EXISTS "Users can insert agent versions" ON public.agent_versions;
DROP POLICY IF EXISTS "Users can update own agent versions" ON public.agent_versions;

-- Recreate with ownership/membership checks via SECURITY DEFINER functions
CREATE POLICY "Owner or member can view versions"
  ON public.agent_versions FOR SELECT
  TO authenticated
  USING (
    public.is_flow_owner(flow_id, auth.uid())
    OR public.is_flow_member(flow_id, auth.uid())
  );

CREATE POLICY "Owner or editor can insert versions"
  ON public.agent_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_flow_owner(flow_id, auth.uid())
    OR public.is_flow_editor(flow_id, auth.uid())
  );

CREATE POLICY "Owner or editor can update versions"
  ON public.agent_versions FOR UPDATE
  TO authenticated
  USING (
    public.is_flow_owner(flow_id, auth.uid())
    OR public.is_flow_editor(flow_id, auth.uid())
  );
