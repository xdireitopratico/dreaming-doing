# AGENT.md

> Ponte para agentes LLM. **Leia [FORGE.md](./FORGE.md) primeiro.**

- Arquitetura: [`.commandcode/ARCHITECTURE.md`](./.commandcode/ARCHITECTURE.md)
- Lista de higienização: [HYGIENE-TASKS.md](./HYGIENE-TASKS.md)

**Não usar:** PGMQ, `agent-worker`, Trigger.dev, `useSSE`, polling 350ms, SSE watch.

**Caminho único:** `useAgentRun` → Edge `agent-run` → Inngest → `execute` → `agent_stream_events` → Supabase Realtime.