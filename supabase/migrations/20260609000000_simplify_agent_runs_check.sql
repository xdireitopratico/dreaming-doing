-- 20260609000000_simplify_agent_runs_check.sql
-- P2 (Fase 4.7 → 4.8): simplifica agent_runs.status CHECK constraint.
--
-- ANTES: ('running', 'completed', 'failed', 'canceled', 'awaiting_user',
--        'awaiting_plan_approval', 'rejected')
-- DEPOIS: ('pending', 'running', 'completed', 'failed', 'canceled', 'awaiting_user')
--
-- Remove estados do fluxo antigo de plan mode (awaiting_plan_approval, rejected)
-- que não são mais usados: o loop termina a run com status='completed' ao
-- propor o plano, e o server action plan-decide cria uma nova run de build.
--
-- Adiciona 'pending' (estado inicial da nova run criada pelo plan-decide
-- server action antes do trigger Inngest).
--
-- Idempotente: DROP IF EXISTS + DO block para casos de nome duplicado.
--
-- Também atualiza acquire_agent_run_lock para remover 'awaiting_plan_approval'
-- da predicate (status ativos que bloqueiam nova run).

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'agent_runs'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';
  IF cname IS NOT NULL AND cname <> 'agent_runs_status_check' THEN
    EXECUTE format('ALTER TABLE agent_runs DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN (
    'pending',
    'running',
    'completed',
    'failed',
    'canceled',
    'awaiting_user'
  ));

COMMENT ON CONSTRAINT agent_runs_status_check ON agent_runs IS
  'Fase 4.8: status válidos. pending = criado, aguardando trigger. running = executando. completed/failed/canceled = finais. awaiting_user = qualificando (precisa resposta).';

-- acquire_agent_run_lock: predicate só conta statuses ativos.
-- awaiting_plan_approval removido (não existe mais no CHECK).
CREATE OR REPLACE FUNCTION acquire_agent_run_lock(
  p_project_id uuid,
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS uuid AS $$
DECLARE
  lock_key1 int := hashtext('agent_run_lock');
  lock_key2 int := hashtext(p_project_id::text);
  existing_id uuid;
  new_id uuid;
BEGIN
  IF NOT pg_try_advisory_xact_lock(lock_key1, lock_key2) THEN
    SELECT id INTO existing_id FROM agent_runs
    WHERE project_id = p_project_id
      AND status IN ('running', 'awaiting_user', 'pending')
    ORDER BY started_at DESC LIMIT 1;
    RETURN existing_id;
  END IF;

  SELECT id INTO existing_id FROM agent_runs
  WHERE project_id = p_project_id
    AND status IN ('running', 'awaiting_user', 'pending')
  ORDER BY started_at DESC LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO agent_runs (project_id, conversation_id, user_id, status)
  VALUES (p_project_id, p_conversation_id, p_user_id, 'running')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
