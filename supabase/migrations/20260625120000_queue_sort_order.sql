-- Queue sort_order: permite reordenação via drag-and-drop
-- Atualmente ordena por created_at ASC; novo campo permite ordem customizada.

ALTER TABLE public.agent_pending_messages
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Popular sort_order existente com base no created_at (mais antigo = menor)
UPDATE public.agent_pending_messages m
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at ASC) AS rn
  FROM public.agent_pending_messages
) sub
WHERE m.id = sub.id;

-- Novo índice composto: a query de listagem usa sort_order ASC
CREATE INDEX IF NOT EXISTS agent_pending_messages_project_sort_idx
  ON public.agent_pending_messages(project_id, sort_order);
