-- Remove fila PGMQ agent_chunks e funções legadas (agente usa Inngest).
DROP FUNCTION IF EXISTS public.drain_agent_chunks_queue();
DROP FUNCTION IF EXISTS public.purge_agent_chunks_queue();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    PERFORM pgmq.drop_queue('agent_chunks');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgmq drop agent_chunks skipped: %', SQLERRM;
END $$;