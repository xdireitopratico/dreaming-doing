-- Purga atômica da fila PGMQ usando pop (read+delete atômico).
-- Chamar via: SELECT public.drain_agent_chunks_queue();
CREATE OR REPLACE FUNCTION public.drain_agent_chunks_queue()
RETURNS int AS $$
DECLARE
  drained int := 0;
  msg jsonb;
BEGIN
  LOOP
    SELECT pgmq_public.pop('agent_chunks') INTO msg;
    EXIT WHEN msg IS NULL;
    drained := drained + 1;
  END LOOP;
  RETURN drained;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
