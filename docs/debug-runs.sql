-- debug-runs.sql — Queries pra investigar runs com erro no FORGE.
--
-- Como usar: rodar no Supabase SQL Editor (https://app.supabase.com/project/_/sql)
-- ou via psql com service-role key.
--
-- Cada query é standalone. Comentários dizem o que ela responde.

-- ============================================================================
-- Q1: Runs com erro nas últimas 24h (modelo + provider + erro raw + steps)
-- ============================================================================
SELECT
  id,
  started_at,
  finished_at,
  status,
  meta->>'model' AS model,
  meta->>'provider' AS provider,
  meta->>'toolsUsed' AS tools_used,
  steps,
  error,
  EXTRACT(EPOCH FROM (finished_at - started_at))::int AS duration_s
FROM agent_runs
WHERE status IN ('failed', 'canceled')
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC
LIMIT 50;

-- ============================================================================
-- Q2: Tipos de erro mais frequentes (pra saber se é sempre o mesmo)
-- ============================================================================
SELECT
  CASE
    WHEN error ILIKE '%nvidia%' OR error ILIKE '%unit variant%' THEN 'NVIDIA NIM 5xx (payload incompatível)'
    WHEN error ILIKE '%rate limit%' OR error ILIKE '%429%' THEN 'Rate limit (429)'
    WHEN error ILIKE '%529%' OR error ILIKE '%503%' OR error ILIKE '%overload%' THEN 'Overload (529/503)'
    WHEN error ILIKE '%timeout%' OR error ILIKE '%timed out%' THEN 'Timeout'
    WHEN error ILIKE '%Resposta sem tool nem texto%' THEN 'Empty LLM response (plan mode)'
    WHEN error ILIKE '%zumbi%' OR error ILIKE '%expirado%' THEN 'Zombie (heartbeat stale)'
    WHEN error ILIKE '%dispatch%' THEN 'Dispatch failed (Inngest)'
    WHEN error ILIKE '%cancelad%' THEN 'Canceled'
    ELSE 'Other: ' || LEFT(error, 80)
  END AS error_type,
  COUNT(*) AS count,
  MAX(started_at) AS last_seen
FROM agent_runs
WHERE started_at > NOW() - INTERVAL '7 days'
  AND error IS NOT NULL
GROUP BY error_type
ORDER BY count DESC;

-- ============================================================================
-- Q3: Stream events do run com erro (pegar tool calls e response do LLM)
-- ============================================================================
-- Substituir 'RUN_ID_AQUI' pelo id do run
WITH run_events AS (
  SELECT seq, event_type, payload, created_at
  FROM agent_stream_events
  WHERE run_id = 'RUN_ID_AQUI'
  ORDER BY seq ASC
)
SELECT
  seq,
  event_type,
  payload->>'type' AS payload_type,
  CASE
    WHEN event_type = 'error' OR event_type = 'finish' THEN LEFT(payload::text, 500)
    WHEN event_type IN ('tool_start', 'tool_done') THEN payload->>'name'
    WHEN event_type = 'assistant_text' THEN LEFT(payload->>'text', 200)
    WHEN event_type = 'robin_rotate' THEN payload->>'message'
    ELSE LEFT(payload::text, 200)
  END AS summary,
  created_at
FROM run_events;

-- ============================================================================
-- Q4: Runs que falharam vs. tools executados antes da falha
-- ============================================================================
SELECT
  r.id,
  r.started_at,
  r.error LIKE '%nvidia%unit variant%' AS is_nvidia_500,
  r.meta->>'model' AS model,
  -- contar tools a partir do stream events
  (SELECT COUNT(*)
   FROM agent_stream_events e
   WHERE e.run_id = r.id
     AND e.event_type = 'tool_done'
     AND (e.payload->>'ok')::boolean = true) AS tools_ok,
  (SELECT COUNT(*)
   FROM agent_stream_events e
   WHERE e.run_id = r.id
     AND e.event_type = 'tool_done'
     AND (e.payload->>'ok')::boolean = false) AS tools_failed
FROM agent_runs r
WHERE r.status = 'failed'
  AND r.started_at > NOW() - INTERVAL '7 days'
ORDER BY r.started_at DESC
LIMIT 30;

-- ============================================================================
-- Q5: Latência por modelo (p95 dos últimos 7 dias)
-- ============================================================================
SELECT
  meta->>'model' AS model,
  COUNT(*) AS runs,
  ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))::numeric, 1) AS avg_s,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)))::numeric, 1) AS p50_s,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)))::numeric, 1) AS p95_s
FROM agent_runs
WHERE started_at > NOW() - INTERVAL '7 days'
  AND finished_at IS NOT NULL
  AND meta->>'model' IS NOT NULL
GROUP BY model
ORDER BY runs DESC;

-- ============================================================================
-- Q6: Timeline de telemetria por run (cliente + servidor — falhas de UX/stream)
-- ============================================================================
-- Substituir 'RUN_ID_AQUI' pelo id do run. Complementa Q3 (stream events) com
-- o que o browser/servidor reportou: seq gaps, realtime reconnect, plan missing, etc.
-- Também via CLI: ./scripts/debug-log.sh --run-id RUN_ID_AQUI --telemetry-only
SELECT
  created_at,
  event_name,
  run_id,
  LEFT(project_id::text, 8) AS project,
  payload
FROM agent_streaming_telemetry
WHERE run_id = 'RUN_ID_AQUI'
ORDER BY created_at ASC;

-- ============================================================================
-- Q7: Eventos de degradação mais frequentes (últimas 24h — todos os projetos)
-- ============================================================================
SELECT
  event_name,
  COUNT(*) AS count,
  MAX(created_at) AS last_seen
FROM agent_streaming_telemetry
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND event_name IN (
    'agent.stream_seq_gap',
    'agent.stream_seq_dropped',
    'agent.realtime_channel_error',
    'agent.materialized_shape_mismatch',
    'agent.materialized_release_pending',
    'agent.plan_source_runid_missing',
    'agent.narration_stream_overlap',
    'agent.stale_stream_detected',
    'agent.dual_tab_detected',
    'agent.run_dispatch_failed'
  )
GROUP BY event_name
ORDER BY count DESC;
