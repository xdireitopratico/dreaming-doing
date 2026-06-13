
-- =====================================================
-- ITEM 1: Fix RLS infinite recursion on agent_flows
-- =====================================================

-- 1. Create SECURITY DEFINER helper functions
CREATE OR REPLACE FUNCTION public.is_flow_owner(_flow_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_flows
    WHERE id = _flow_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_flow_member(_flow_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_flow_members
    WHERE flow_id = _flow_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_flow_editor(_flow_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_flow_members
    WHERE flow_id = _flow_id
      AND user_id = _user_id
      AND role IN ('editor', 'owner')
  )
$$;

-- 2. Drop broken policies on agent_flows
DROP POLICY IF EXISTS "Members can view shared flows" ON public.agent_flows;
DROP POLICY IF EXISTS "Editors can update shared flows" ON public.agent_flows;
DROP POLICY IF EXISTS "Users can manage own flows" ON public.agent_flows;
DROP POLICY IF EXISTS "Anyone can view published templates" ON public.agent_flows;

-- 3. Recreate agent_flows policies using SECURITY DEFINER functions
CREATE POLICY "Owner manages own flows"
  ON public.agent_flows FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members can view shared flows"
  ON public.agent_flows FOR SELECT
  TO authenticated
  USING (public.is_flow_member(id, auth.uid()));

CREATE POLICY "Editors can update shared flows"
  ON public.agent_flows FOR UPDATE
  TO authenticated
  USING (public.is_flow_editor(id, auth.uid()));

CREATE POLICY "Anyone can view published templates"
  ON public.agent_flows FOR SELECT
  TO authenticated
  USING (is_template = true AND status = 'published');

-- 4. Drop and recreate agent_flow_members policies using SECURITY DEFINER functions
DROP POLICY IF EXISTS "Flow owner can add members" ON public.agent_flow_members;
DROP POLICY IF EXISTS "Flow owner can delete members" ON public.agent_flow_members;
DROP POLICY IF EXISTS "Flow owner can update members" ON public.agent_flow_members;
DROP POLICY IF EXISTS "Users can view own memberships" ON public.agent_flow_members;

CREATE POLICY "Owner can manage members"
  ON public.agent_flow_members FOR ALL
  TO authenticated
  USING (public.is_flow_owner(flow_id, auth.uid()))
  WITH CHECK (public.is_flow_owner(flow_id, auth.uid()));

CREATE POLICY "Users can view own memberships"
  ON public.agent_flow_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR invited_by = auth.uid());
