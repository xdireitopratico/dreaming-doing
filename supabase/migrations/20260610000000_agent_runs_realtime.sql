-- Enable Realtime on agent_runs so status channel updates reach the client.
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
ALTER TABLE public.agent_runs REPLICA IDENTITY FULL;