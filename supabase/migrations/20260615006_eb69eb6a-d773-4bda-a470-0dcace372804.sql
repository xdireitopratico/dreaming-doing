
-- Agent flow members for collaboration
CREATE TABLE public.agent_flow_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID,
  invited_email TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, user_id)
);

CREATE INDEX idx_agent_flow_members_flow ON public.agent_flow_members(flow_id);
CREATE INDEX idx_agent_flow_members_user ON public.agent_flow_members(user_id);

ALTER TABLE public.agent_flow_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own memberships
CREATE POLICY "Users can view own memberships"
  ON public.agent_flow_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR invited_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid()
  ));

-- Only flow owner can insert members
CREATE POLICY "Flow owner can add members"
  ON public.agent_flow_members FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid()
  ));

-- Flow owner can update members
CREATE POLICY "Flow owner can update members"
  ON public.agent_flow_members FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid()
  ));

-- Flow owner can delete members
CREATE POLICY "Flow owner can delete members"
  ON public.agent_flow_members FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_flows af WHERE af.id = flow_id AND af.user_id = auth.uid()
  ) OR user_id = auth.uid());

-- Update agent_flows RLS to allow shared access
CREATE POLICY "Members can view shared flows"
  ON public.agent_flows FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.agent_flow_members m WHERE m.flow_id = id AND m.user_id = auth.uid()
    )
  );

-- Members with editor role can update shared flows
CREATE POLICY "Editors can update shared flows"
  ON public.agent_flows FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.agent_flow_members m WHERE m.flow_id = id AND m.user_id = auth.uid() AND m.role IN ('editor', 'owner')
    )
  );
