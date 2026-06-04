-- Realtime: projetos + conversas no publication; políticas de canal corrigidas.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.projects REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "authenticated can listen to own editor channel" ON realtime.messages;

CREATE POLICY "authenticated can listen to forge realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    realtime.topic() LIKE 'editor-%'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.owner_id = auth.uid()
        AND p.id::text = substring(realtime.topic() FROM 8)
    )
  )
  OR realtime.topic() = ('projects-' || auth.uid()::text)
);