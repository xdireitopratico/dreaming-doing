# FORGE — Fonte de Verdade (LLM)

> **Leia só isto** para operar no repo.

## Hierarquia de docs

| Arquivo                                              | Quem lê      | Conteúdo                                        |
| ---------------------------------------------------- | ------------ | ----------------------------------------------- |
| **FORGE.md**                                         | LLM / agente | Caminho único, arquivos críticos, deploy, debug |
| **README.md**                                        | Humano       | Produto, `bun run dev`, link para FORGE         |
| `AGENT.md` / `CLAUDE.md` / `GEMINI.md` / `AGENTS.md` | IDEs         | Ponte de 3 linhas → FORGE                       |

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
  → step.run execute-loop (handler Vercel /api/inngest)
  → run-executor → run-job → loop.ts  (in-process Node, sem HTTP Edge)
  → appendStreamEvent → agent_stream_events
  → Supabase Realtime (INSERT events + UPDATE agent_runs)
  → useAgentRun → agent-progress → lovable-thread → ChatStream / ForgeAssistantBlock
```

### Fila ativa (não é legado)

Quando o projeto já tem run ocupado, novas mensagens vão para **`agent_pending_messages`** via `useAgentRun.queueMessage()`. UI: contador no header + barra acima do composer.

Ao terminar um run, Inngest chama `agent-run { action: "continue_queue" }` (service role) para consumir a fila. O frontend usa `drain_queue` (nunca `connect`/`runAgent`) para recuperar fila órfã. **Enqueue só com `enqueue: true`** (via `queueMessage` após mensagem do usuário) — `connect` concorrente retorna `busy` sem INSERT fantasma.

### Removido — não reintroduzir

| Legado                                                    | Substituto                               |
| --------------------------------------------------------- | ---------------------------------------- |
| `useSSE.ts`, SSE watch/replay no Edge                     | `useAgentRun.ts` + Realtime              |
| Polling 350ms (`streamEventsResponse`, `followQueuedRun`) | Realtime + catch-up único ao subscribe   |
| `agent-worker`, PGMQ **dispatch**                         | Inngest                                  |
| Trigger.dev                                               | Inngest                                  |
| `runChunkedJob` inline no Edge                            | Inngest loop in-process                  |
| `agent-run { action: "execute" }`                         | `src/inngest/executor/run-agent-loop.ts` |

Schema PGMQ no DB + check em `/health` = **legado** (sem dispatch no agente).

## Arquivos críticos

| Arquivo                                             | Papel                                              |
| --------------------------------------------------- | -------------------------------------------------- |
| `src/hooks/useAgentRun.ts`                          | Hook do editor — Realtime only                     |
| `src/lib/agent-progress.ts`                         | Reducer `applyAgentProgressEvent`                  |
| `src/routes/projects/$projectId/index.tsx`          | Editor, plan approve → `watch(newRunId)`           |
| `src/inngest/functions/agent-*.ts`                  | Jobs duráveis                                      |
| `src/inngest/executor/run-agent-loop.ts`            | Loop in-process no Vercel                          |
| `supabase/functions/agent-run/index.ts`             | `run`, `cancel`, `pending_count`, `continue_queue` |
| `supabase/functions/agent-run/continue-queue.ts`    | Drain da fila após run completar                   |
| `supabase/functions/_shared/agent-pending-queue.ts` | Enqueue, expire stale runs, evaluate drain         |
| `supabase/functions/agent-run/run-setup.ts`         | Provider/keys — fonte única                        |
| `supabase/functions/agent-run/run-executor.ts`      | Execução + `appendStreamEvent`                     |
| `supabase/functions/agent-run/loop.ts`              | Loop do agente                                     |
| `supabase/functions/_shared/agent-stream.ts`        | `appendStreamEvent` (Edge)                         |

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

1. **Secret Edge:** `INNGEST_EVENT_KEY` em Supabase → Edge Functions secrets (não só `.env.local`). Centralizado em `supabase/functions/agent-run/index.ts` (send helper + dispatch_build + continue-queue). Sem ela: early loud error + append `finish` (nunca pending run sem evento terminal; mata "inngest_failed" symptom).
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

4. Logs Edge: `inngest.send_failed_fatal` / `dispatch_build.inngest_failed` (hardened paths now append finish + cleanup).

## Convenções

- `awaiting_user`: Inngest **não** marca `completed` por cima (`agent-build.ts` / `agent-plan.ts`)
- Todo `onEvent` no executor → `appendStreamEvent`
- Plan: `plan-decide.functions.ts` → novo run → `useAgentRun.watch(newRunId)`
- Taste chat (sem chave): JSON `{ ok, content }` — mensagem já no DB, sem `runId`
- Qualify / `awaiting_user`: banner no `ChatStream` + subtítulo no header — resposta no input

## Backlog (concluído)

| #   | Item                                                                 | Status |
| --- | -------------------------------------------------------------------- | ------ |
| B1  | `run-setup.ts` — provider/keys únicos                                | ✅     |
| B5  | `observer.ts` — sandbox `test -e`, tsc `--project`                   | ✅     |
| B6  | `loop.ts` — forceTools preserva assistant msg; checkpoint resume     | ✅     |
| D19 | `AiDiffViewer` — `before` fallback via `fileMap`                     | ✅     |
| E1  | `MarkdownRenderer` em ChatStream/ChatInput                           | ✅     |
| B7  | `loop.ts` — stuck detection única (reativa após exec)                | ✅     |
| B8  | `sandbox.ts` `kill()` limpa meta preview no projeto                  | ✅     |
| B9  | UX qualify — banner `awaiting_user` + fila no header/chat            | ✅     |
| B10 | Docs + comentários — sem referências SSE/PGMQ ativas                 | ✅     |
| R1  | Migration drop PGMQ `agent_chunks` + funções purge/drain             | ✅     |
| R2  | Editor split: `useEditorPageData`, handlers, `EditorPageLayout`      | ✅     |
| R3  | `AgentTimeline.tsx` inline em `ForgeAssistantBlock`                  | ✅     |
| R5  | Chat Lovable: `lovable-thread`, `agent-narrative`, auto-reject plano | ✅     |
| R4  | `E2bStatusBadge` no workspace header                                 | ✅     |

## Release checklist (projeto maduro)

Gate antes de considerar produção **confiável**. Todos devem passar em `dreaming-doing.vercel.app`.

### P0 — Infra

- [ ] `VERCEL=1 npm run build && npm run build:inngest` passa (CI + Vercel)
- [ ] `INNGEST_EVENT_KEY` em Supabase Edge secrets (`docs/EDGE-SECRETS.md`)
- [ ] `node scripts/smoke-agent-e2e.mjs` → PASS (stream > 1 evento phase/tool)
- [ ] `node scripts/smoke-queue-e2e.mjs` → PASS (fila drena)
- [ ] `node scripts/check-stale-runs.mjs` → 0 runs zumbis

### P1 — Agente + fila

- [ ] Mensagem → `runId` &lt; 2s → Realtime cresce → terminal em &lt; 5 min (prompt simples BYOK)
- [ ] 3 mensagens com agente ocupado → fila 3→0; header = composer hint
- [ ] `awaiting_user` → banner no chat + subtítulo no header
- [ ] Cancel mid-run → status `canceled`; fila não trava

### P2 — Preview

- [ ] Após `fs_write`/`fs_edit` → preview atualiza (`preview-boot` force + evento `preview_sync`)
- [ ] "envia para o preview" → agente usa tools (não só texto)
- [ ] Erro E2B → inline no frame (sem toast de sucesso/info)
- [ ] Preview idle após 10 min → reativa com interação

### P3 — Plan + UX

- [ ] Plan mode → mini-card → approve → novo run; plano persiste após F5
- [ ] Copy/Undo só no rodapé da mensagem assistente
- [ ] Zero toasts informativos (`src/lib/toast.ts` — só `error`)
- [ ] Turno vazio → mensagem explícita + recovery (Continuar/Reenviar)

### Comandos rápidos

```bash
npm run test
npm run typecheck
VERCEL=1 npm run build && npm run build:inngest
node scripts/smoke-agent-e2e.mjs
node scripts/smoke-queue-e2e.mjs
node scripts/check-stale-runs.mjs
```

### Melhorias discricionárias (pós-release)

- Playwright browser E2E no editor
- Refinar `AgentTimeline` (agrupamento de tools)
- Métricas Inngest dashboard automatizadas
