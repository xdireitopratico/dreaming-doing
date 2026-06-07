-- Wrapper público para PGMQ purge — acessível via REST API.
-- Usado para desbloquear a fila quando mensagens zumbis travam o worker.
CREATE OR REPLACE FUNCTION public.purge_agent_chunks_queue()
RETURNS int AS $$
DECLARE
  r record;
  purged int := 0;
BEGIN
  FOR r IN SELECT msg_id FROM pgmq_public.q_agent_chunks LOOP
    BEGIN
      PERFORM pgmq_public.archive('agent_chunks', r.msg_id);
    EXCEPTION WHEN OTHERS THEN
      PERFORM pgmq_public.delete('agent_chunks', r.msg_id);
    END;
    purged := purged + 1;
  END LOOP;
  RETURN purged;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
