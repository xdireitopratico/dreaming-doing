-- 20260608000001_agent_runs_check_awaiting_user.sql
-- Fase 4.7: CHECK constraint do agent_runs.status precisa incluir 'awaiting_user'.
--
-- Histórico da inconsistência:
-- - 20260607000000 adicionou CHECK com: running, completed, failed, canceled,
--   awaiting_plan_approval, rejected.
-- - 20260607000001 (acquire_agent_run_lock) usa 'awaiting_user' como status válido
--   (linhas 24, 32) sem o CHECK ter sido atualizado.
-- - 20260608000000 (agent_lifecycle_robust) documenta awaiting_user como válido
--   no comment mas não atualiza o CHECK.
-- - loop.ts:421 (antes desta fase) tentava escrever 'awaiting_user' e o
--   try/catch vazio engolia a CHECK violation silenciosamente.
--
-- Resultado antes desta migration:
-- - Status 'awaiting_user' NUNCA podia ser setado (CHECK violation).
-- - acquire_agent_run_lock lia active runs com .in('running','awaiting_user')
--   mas awaiting_user nunca existia.
--
-- Esta migration:
-- 1. DROP o CHECK antigo.
-- 2. ADD novo CHECK com todos os status válidos (incluindo awaiting_user).
-- 3. Não é destrutivo: status 'awaiting_user' que nunca pôde ser escrito
--    continua impossível de ter sido escrito, então não há dados pra migrar.

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
