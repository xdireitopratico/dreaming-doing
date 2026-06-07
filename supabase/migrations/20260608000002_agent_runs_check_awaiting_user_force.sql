-- 20260608000002_agent_runs_check_awaiting_user_force.sql
-- Fase 4.7: idempotente. Aplica a CHECK constraint do agent_runs.status
-- incluindo 'awaiting_user'. A migration 20260608000001 com mesmo nome foi
-- aplicada pelo parallel session antes deste fix existir — mas o conteúdo
-- daquela migration pode não ter incluído o awaiting_user. Esta aqui é
-- idempotente e garante o estado correto do CHECK.
--
-- Idempotência:
-- 1. DROP CONSTRAINT IF EXISTS (no-op se já removido).
-- 2. ADD CONSTRAINT com a lista completa. Se já existir com mesmo nome,
--    o IF NOT EXISTS não é suportado para CHECK, então checamos via DO block.
--
-- Se a constraint antiga tinha o nome 'agent_runs_status_check' (padrão
-- Supabase), este DROP a remove. Se a versão paralela usou outro nome,
-- ela não é removida e o ADD falharia com 'constraint already exists' —
-- nesse caso, o DO block abaixo faz DROP CONDITIONAL.

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
    'running',
    'completed',
    'failed',
    'canceled',
    'awaiting_plan_approval',
    'rejected',
    'awaiting_user'
  ));

COMMENT ON CONSTRAINT agent_runs_status_check ON agent_runs IS
  'Fase 4.7: status válidos. awaiting_user = qualificando ou aguardando resposta. awaiting_plan_approval = plano proposto aguardando approve/reject. running/active = executando.';
