# FORGE — Guia para Agentes (LLM)

> Leia isto primeiro. Arquitetura profunda: [`.commandcode/ARCHITECTURE.md`](.commandcode/ARCHITECTURE.md)

## Stack

- **Frontend:** TanStack Start + React + Vite → Vercel
- **Backend:** Supabase Edge Functions + Postgres + Realtime
- **Durabilidade do agente:** Inngest (`/api/inngest` no Vercel)
- **Sandbox:** E2B (preview-boot)

## Caminho de execução do agente (único)

```
ChatInput → useAgentRun → POST /functions/v1/agent-run
  → Inngest (agent/plan.requested | agent/build.requested)
  → POST agent-run { action: "execute" } → run-executor → loop.ts
  → appendStreamEvent → agent_stream_events
  → Supabase Realtime → useAgentRun → AgentProgress → ChatStream
```

**Não usar:** PGMQ, `agent-worker` (removido), Trigger.dev (removido), `useSSE` (removido).

## Arquivos críticos

| Arquivo | Papel |
|---------|-------|
| `src/hooks/useAgentRun.ts` | Hook do editor — Realtime + reducer |
| `src/lib/agent-progress.ts` | Tipos + `applyAgentProgressEvent` |
| `src/inngest/functions/agent-*.ts` | Jobs duráveis plan/build |
| `supabase/functions/agent-run/` | Entrypoint Edge (run, execute, cancel, replay) |
| `supabase/functions/agent-run/run-executor.ts` | Execução + streaming persistido |
| `supabase/functions/agent-run/loop.ts` | Loop do agente |
| `src/routes/projects/$projectId/index.tsx` | Editor principal |

## Deploy

- Supabase ref canônico: `dpduljngdurfpmaclffa`
- Scripts: `scripts/sync/deploy-all.sh`, `scripts/sync/migrate.sh`
- Build Vercel: `npm run build && npm run build:inngest`

## Debug checklist

1. `agent_runs.status` — pending → running → completed | awaiting_user | failed
2. `SELECT count(*) FROM agent_stream_events WHERE run_id = '...'` — deve ser > 1
3. Inngest dashboard — evento `agent/plan.requested` ou `agent/build.requested` disparou?
4. Frontend — `useAgentRun.connected` e `progress.timeline` crescendo?

## Convenções

- Status de espera: `awaiting_user` — Inngest **não** deve marcar `completed` por cima
- Streaming: todo `onEvent` no executor deve chamar `appendStreamEvent`
- Plan mode: approve via `plan-decide.functions.ts` → novo run + `agent/build.requested`