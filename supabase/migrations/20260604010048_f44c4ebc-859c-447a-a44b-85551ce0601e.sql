-- Defense-in-depth: bloqueia subscrição cruzada de canais Realtime.
-- Mesmo que postgres_changes já respeite RLS das tabelas-fonte, restringimos
-- aqui o roteamento de mensagens Realtime por tópico → projeto → owner.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can listen to own editor channel" ON realtime.messages;
CREATE POLICY "authenticated can listen to own editor channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'editor-%'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.owner_id = auth.uid()
      AND p.id::text = substring(realtime.topic() FROM 8)
  )
);