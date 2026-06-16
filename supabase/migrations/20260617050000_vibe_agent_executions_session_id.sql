-- Make Vibe Agent execution rows compatible with the existing gateway execution schema.
ALTER TABLE public.agent_executions
  ADD COLUMN IF NOT EXISTS session_id UUID;

UPDATE public.agent_executions
SET session_id = COALESCE(request_id::uuid, id)
WHERE session_id IS NULL AND request_id IS NOT NULL;

UPDATE public.agent_executions
SET session_id = id
WHERE session_id IS NULL;

ALTER TABLE public.agent_executions
  ALTER COLUMN session_id SET NOT NULL;
