# FORGE — Fonte de Verdade (LLM)

> **Leia só isto** para operar no repo. Detalhe técnico: [`.commandcode/ARCHITECTURE.md`](.commandcode/ARCHITECTURE.md)

## Hierarquia de docs

| Arquivo | Quem lê | Conteúdo |
|---------|---------|----------|
| **FORGE.md** | LLM / agente | Caminho único, arquivos críticos, deploy, debug |
| **ARCHITECTURE.md** | LLM aprofundando | Backend ↔ frontend, tabelas |
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

### Fila ativa (não é legado)

Quando o projeto já tem run ocupado, novas mensagens vão para **`agent_pending_messages`** via `useAgentRun.queueMessage()`. UI: contador no header do chat + hint no `ChatStream`.

Ao terminar um run, Inngest chama `agent-run { action: "continue_queue" }` (service role) para consumir a fila. O frontend usa `drain_queue` (nunca `connect`/`runAgent`) para recuperar fila órfã. **Enqueue só com `enqueue: true`** (via `queueMessage` após mensagem do usuário) — `connect` concorrente retorna `busy` sem INSERT fantasma.

### Removido — não reintroduzir

| Legado | Substituto |
|--------|------------|
| `useSSE.ts`, SSE watch/replay no Edge | `useAgentRun.ts` + Realtime |
| Polling 350ms (`streamEventsResponse`, `followQueuedRun`) | Realtime + catch-up único ao subscribe |
| `agent-worker`, PGMQ **dispatch** | Inngest |
| Trigger.dev | Inngest |
| `runChunkedJob` inline no Edge | Inngest execute |

Schema PGMQ no DB + check em `/health` = **legado** (sem dispatch no agente).

## Arquivos críticos

| Arquivo | Papel |
|---------|-------|
| `src/hooks/useAgentRun.ts` | Hook do editor — Realtime only |
| `src/lib/agent-progress.ts` | Reducer `applyAgentProgressEvent` |
| `src/routes/projects/$projectId/index.tsx` | Editor, plan approve → `watch(newRunId)` |
| `src/inngest/functions/agent-*.ts` | Jobs duráveis |
| `supabase/functions/agent-run/index.ts` | `run`, `execute`, `cancel`, `pending_count`, `continue_queue` |
| `supabase/functions/agent-run/continue-queue.ts` | Drain da fila após run completar |
| `supabase/functions/_shared/agent-pending-queue.ts` | Enqueue, expire stale runs, evaluate drain |
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

### Fila presa / agente não roda

1. **Secret Edge:** `INNGEST_EVENT_KEY` em Supabase → Edge Functions secrets (não só `.env.local`). Sem ela, `continue_queue` falha com `inngest_failed` nos logs.
2. **Runs zumbis:** `expireStaleRuns` marca `running`/`pending` > 15 min como `failed` no próximo `agent-run`.
3. **SQL de limpeza** (substitua `PROJECT_ID`):

```sql
-- Fila órfã
DELETE FROM agent_pending_messages WHERE project_id = 'PROJECT_ID';

-- Runs presos
UPDATE agent_runs
SET status = 'failed', finished_at = now(), error = 'manual cleanup'
WHERE project_id = 'PROJECT_ID' AND status IN ('running', 'pending');

-- Contagem
SELECT count(*) FROM agent_pending_messages WHERE project_id = 'PROJECT_ID';
```

4. Logs Edge: `inngest.send_failed_fatal` ou `continue_queue` com `reason: inngest_failed`.

## Convenções

- `awaiting_user`: Inngest **não** marca `completed` por cima (`agent-build.ts` / `agent-plan.ts`)
- Todo `onEvent` no executor → `appendStreamEvent`
- Plan: `plan-decide.functions.ts` → novo run → `useAgentRun.watch(newRunId)`
- Taste chat (sem chave): JSON `{ ok, content }` — mensagem já no DB, sem `runId`
- Qualify / `awaiting_user`: banner no `ChatStream` + subtítulo no header — resposta no input

## Backlog (concluído)

| # | Item | Status |
|---|------|--------|
| B1 | `run-setup.ts` — provider/keys únicos | ✅ |
| B5 | `observer.ts` — sandbox `test -e`, tsc `--project` | ✅ |
| B6 | `loop.ts` — forceTools preserva assistant msg; checkpoint resume | ✅ |
| D19 | `AiDiffViewer` — `before` fallback via `fileMap` | ✅ |
| E1 | `MarkdownRenderer` em ChatStream/ChatInput | ✅ |
| B7 | `loop.ts` — stuck detection única (reativa após exec) | ✅ |
| B8 | `sandbox.ts` `kill()` limpa meta preview no projeto | ✅ |
| B9 | UX qualify — banner `awaiting_user` + fila no header/chat | ✅ |
| B10 | Docs + comentários — sem referências SSE/PGMQ ativas | ✅ |
| R1 | Migration drop PGMQ `agent_chunks` + funções purge/drain | ✅ |
| R2 | Editor split: `useEditorPageData`, handlers, `EditorPageLayout` | ✅ |
| R3 | `AgentTimeline.tsx` no ChatStream | ✅ |
| R4 | `E2bStatusBadge` no workspace header | ✅ |

## Restante

Nenhum item obrigatório. Melhorias futuras são discricionárias (ex.: refinar `AgentTimeline`, testes E2E).