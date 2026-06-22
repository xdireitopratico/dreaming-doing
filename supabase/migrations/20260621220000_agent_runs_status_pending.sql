-- 20260621220000_agent_runs_status_pending.sql
-- Adiciona 'pending' ao CHECK constraint de agent_runs.status.
-- Necessário para que INSERT INTO agent_runs (status: 'pending') funcione —
-- usado em plan-decide.functions.ts:174 quando o usuário aprova um plano.
-- A migration 20260608000002_agent_runs_check_awaiting_user_force.sql não
-- incluiu 'pending' e isso bloqueia o caminho Plan → Build inteiro.

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
    'awaiting_plan_approval',
    'rejected',
    'awaiting_user'
  ));

COMMENT ON CONSTRAINT agent_runs_status_check ON agent_runs IS
  'Status válidos. pending = agendado, aguardando Inngest. running = executando. awaiting_user = qualificando/aguardando. awaiting_plan_approval = plano proposto.';
