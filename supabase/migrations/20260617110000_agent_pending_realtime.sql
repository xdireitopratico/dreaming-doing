-- Enable Realtime on agent_pending_messages so drained queue items refresh
-- the chat composer and queued user bubbles update without a full refetch.
-- Fixes Bug #5: drained queue messages "sumiam" sem erro.
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_pending_messages;
ALTER TABLE public.agent_pending_messages REPLICA IDENTITY FULL;
