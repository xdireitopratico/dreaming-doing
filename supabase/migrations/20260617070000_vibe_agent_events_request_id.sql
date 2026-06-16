-- Add request_id for persistent Vibe Agent event replay compatibility.
ALTER TABLE public.vibe_agent_events
  ADD COLUMN IF NOT EXISTS request_id UUID;

UPDATE public.vibe_agent_events
SET request_id = execution_id
WHERE request_id IS NULL AND execution_id IS NOT NULL;
