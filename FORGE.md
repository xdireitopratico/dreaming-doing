# FORGE — Fonte de Verdade (LLM)

> **Leia só isto** para operar no repo. Detalhe técnico: [`.commandcode/ARCHITECTURE.md`](.commandcode/ARCHITECTURE.md)

## Hierarquia de docs

| Arquivo | Quem lê | Conteúdo |
|---------|---------|----------|
| **FORGE.md** | LLM / agente | Caminho único, arquivos críticos, deploy, debug |
| **ARCHITECTURE.md** | LLM aprofundando | Backend ↔ frontend, tabelas, bugs pendentes |
| **README.md** | Humano | Produto, `bun run dev`, link para FORGE |
| `AGENT.md` / `CLAUDE.md` / `GEMINI.md` / `AGENTS.md` | IDEs | Ponte de 3 linhas → FORGE |

**Ignorar (redirecionam para cá):** `opencode.md`, `doc.md`

## Stack

- **Frontend:** TanStack Start + React + Vite → Vercel
- **Backend:** Supabase Edge Functions + Postgres + **Realtime**
- **Durabilidade:** Inngest (`/api/inngest`)
- **Sandbox:** E2B (`preview-boot`)

## Caminho do agente (único — sem alternativas)

```
ChatInput → useAgentRun.connect()
  → POST /functions/v1/agent-run  →  { runId }  (< 1s)
  → Inngest (agent/plan.requested | agent/build.requested)
  → POST agent-run { action: "execute" }  (service role)
  → run-executor → run-job → loop.ts
  → appendStreamEvent → agent_stream_events
  → Supabase Realtime (INSERT events + UPDATE agent_runs)
  → useAgentRun → agent-progress → ChatStream
```

### Removido — não reintroduzir

| Legado | Substituto |
|--------|------------|
| `useSSE.ts`, SSE watch/replay | `useAgentRun.ts` + Realtime |
| Polling 350ms (`streamEventsResponse`, `followQueuedRun`) | Realtime + catch-up único ao subscribe |
| `agent-worker`, PGMQ dispatch | Inngest |
| Trigger.dev | Inngest |
| `runChunkedJob` inline no Edge | Inngest execute |

## Arquivos críticos

| Arquivo | Papel |
|---------|-------|
| `src/hooks/useAgentRun.ts` | Hook do editor — Realtime only |
| `src/lib/agent-progress.ts` | Reducer `applyAgentProgressEvent` |
| `src/routes/projects/$projectId/index.tsx` | Editor, plan approve → `watch(newRunId)` |
| `src/inngest/functions/agent-*.ts` | Jobs duráveis |
| `supabase/functions/agent-run/index.ts` | `run`, `execute`, `cancel` |
| `supabase/functions/agent-run/run-setup.ts` | Provider/keys — fonte única |
| `supabase/functions/agent-run/run-executor.ts` | Execução + `appendStreamEvent` |
| `supabase/functions/agent-run/loop.ts` | Loop do agente |
| `supabase/functions/_shared/agent-stream.ts` | `appendStreamEvent` (Edge) |

## Deploy

- Supabase ref: `dpduljngdurfpmaclffa`
- `./scripts/sync/migrate.sh` → `./scripts/sync/deploy-all.sh`
- Vercel: `npm run build && npm run build:inngest`

Edge functions deployadas: `agent-run`, `health`, `preview-boot`, `e2b-*`, `connector-upsert`, `deploy-publish`, `github-import`, `mcp-server`, `voice-transcribe`, `project-delete`, `admin-platform-secrets`

## Debug (ordem)

1. `agent_runs.status` para o `runId` — `running` → terminal?
2. `SELECT count(*) FROM agent_stream_events WHERE run_id = '…'` — deve crescer (> 1)
3. Inngest dashboard — evento disparou e step `execute` ok?
4. Browser — `useAgentRun.connected` e `progress.timeline.length` crescem?
5. Realtime — migration `agent_runs` + `agent_stream_events` com `REPLICA IDENTITY FULL`

## Convenções

- `awaiting_user`: Inngest **não** marca `completed` por cima (`agent-build.ts` / `agent-plan.ts`)
- Todo `onEvent` no executor → `appendStreamEvent`
- Plan: `plan-decide.functions.ts` → novo run → `useAgentRun.watch(newRunId)`
- Taste chat (sem chave): JSON `{ ok, content }` — mensagem já no DB, sem `runId`

## Backlog

| # | Item | Status |
|---|------|--------|
| B1 | `run-setup.ts` — provider/keys únicos | ✅ |
| B5 | `observer.ts` — sandbox `test -e`, tsc `--project` | ✅ |
| B6 | `loop.ts` — forceTools preserva assistant msg; checkpoint resume | ✅ |
| D19 | `AiDiffViewer` — `before` fallback via `fileMap` | ✅ |
| E1 | `MarkdownRenderer` em ChatStream/ChatInput | ✅ |