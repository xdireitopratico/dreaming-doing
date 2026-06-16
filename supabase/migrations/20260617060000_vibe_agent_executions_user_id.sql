-- Add user_id for Vibe Agent execution metadata compatibility.
ALTER TABLE public.agent_executions
  ADD COLUMN IF NOT EXISTS user_id UUID;
