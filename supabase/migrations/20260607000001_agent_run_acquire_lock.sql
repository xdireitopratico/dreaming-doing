-- acquire_agent_run_lock: atomic check-and-insert for agent_runs.
-- Prevents duplicate active runs when two requests arrive simultaneously
-- at different Edge Function instances (in-memory Map doesn't span instances).
--
-- Uses pg_try_advisory_xact_lock to serialize across transactions without
-- blocking indefinitely — if lock is held by another tx, returns existing
-- active run (or NULL if none yet) so caller can queue/retry.
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
  -- Non-blocking xact-level lock. If another tx holds it, we skip to
  -- checking for existing runs (which the lock holder may have inserted).
  IF NOT pg_try_advisory_xact_lock(lock_key1, lock_key2) THEN
    SELECT id INTO existing_id FROM agent_runs
    WHERE project_id = p_project_id
      AND status IN ('running', 'awaiting_user', 'awaiting_plan_approval')
    ORDER BY started_at DESC LIMIT 1;
    RETURN existing_id;
  END IF;

  -- Lock acquired: atomic check + insert within this transaction.
  SELECT id INTO existing_id FROM agent_runs
  WHERE project_id = p_project_id
    AND status IN ('running', 'awaiting_user', 'awaiting_plan_approval')
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
