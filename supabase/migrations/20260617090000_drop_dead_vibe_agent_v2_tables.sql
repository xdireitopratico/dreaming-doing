-- ============================================================================
-- DROP dead tables from reverted vibe-agent v2 system (commit 6b66037)
-- ============================================================================
-- Background: commit 6b66037 "revert(vibe-agent): remove parallel system,
-- restore original flow builder chat" removed the v2 implementation
-- (agent-loop.ts, vibe-agent-sse.ts, vibe-agent-events.ts, VibeChatPanel,
-- useVibeChat.ts, useVibeInspector.ts, etc) but the migrations that
-- created these tables remained. Zero runtime code references them today.
--
-- KEPT (still alive, used by Secretária do Prometheus feature):
--   - vibe_agent_conversations
--   - vibe_agent_messages
--   - agent_flow_versions (used by useFlowBuilderState, prometheus-healer, aetherforge-gdpr)
--
-- DROPPED (dead, zero refs in src/ and supabase/functions/):
--   - vibe_agent_events
--   - vibe_agent_executions
--   - rate_limit_counters
--   - idempotency_keys (_shared/idempotency.ts is dead code; tool-executor.ts
--     uses its own local checkIdempotency against agent_execution_steps)
-- ============================================================================

DROP TABLE IF EXISTS public.vibe_agent_events CASCADE;
DROP TABLE IF EXISTS public.vibe_agent_executions CASCADE;
DROP TABLE IF EXISTS public.rate_limit_counters CASCADE;
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
