-- Ensure persistent Vibe Agent events expose event_data for compatibility with the new SSE helpers.
ALTER TABLE public.vibe_agent_events
  ADD COLUMN IF NOT EXISTS event_data JSONB;

UPDATE public.vibe_agent_events
SET event_data = payload
WHERE event_data IS NULL AND payload IS NOT NULL;
