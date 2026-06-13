
-- Comments/threads on agent flow nodes
CREATE TABLE public.agent_flow_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  node_id TEXT, -- null = flow-level comment
  parent_id UUID REFERENCES public.agent_flow_comments(id) ON DELETE CASCADE, -- thread replies
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentions TEXT[] DEFAULT '{}', -- user IDs mentioned
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_flow_comments_flow ON public.agent_flow_comments(flow_id);
CREATE INDEX idx_flow_comments_node ON public.agent_flow_comments(flow_id, node_id);
CREATE INDEX idx_flow_comments_parent ON public.agent_flow_comments(parent_id);

ALTER TABLE public.agent_flow_comments ENABLE ROW LEVEL SECURITY;

-- Owner + members can view
CREATE POLICY "Flow owner and members can view comments"
ON public.agent_flow_comments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.agent_flow_members WHERE flow_id = agent_flow_comments.flow_id AND user_id = auth.uid())
);

-- Authenticated can insert on flows they have access to
CREATE POLICY "Members can create comments"
ON public.agent_flow_comments FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.agent_flow_members WHERE flow_id = agent_flow_comments.flow_id AND user_id = auth.uid())
  )
);

-- Author can update own comments
CREATE POLICY "Authors can update own comments"
ON public.agent_flow_comments FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Author or flow owner can delete
CREATE POLICY "Author or owner can delete comments"
ON public.agent_flow_comments FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.agent_flows WHERE id = flow_id AND user_id = auth.uid())
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_flow_comments;
