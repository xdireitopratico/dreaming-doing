-- Cria fila PGMQ para chunks do agente (requer extensão pgmq habilitada no Dashboard).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    PERFORM pgmq.create('agent_chunks');
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN undefined_function THEN
    RAISE NOTICE 'pgmq não habilitado — crie a fila agent_chunks no Dashboard → Queues';
END $$;