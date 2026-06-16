-- Allow Vibe Agent chat/inspector event types in the shared event log.
DO $$
BEGIN
  ALTER TABLE public.vibe_agent_events DROP CONSTRAINT IF EXISTS vibe_agent_events_event_type_check;
END $$;
