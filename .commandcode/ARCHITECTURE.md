# FORGE Agent System — Arquitetura Canônica (v2)

> Detalhe técnico. **Entrada:** [FORGE.md](../FORGE.md) (fonte de verdade).
> Atualizado 2026-06-07 — Inngest + Realtime, sem SSE/PGMQ/worker.

---

## 1. VISÃO GERAL: CAMINHO ÚNICO (P0)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + TanStack Router)             │
│                                                                      │
│  ChatInput → useAgentRun.connect() → POST /agent-run                 │
│       │                                                              │
│       ├─ Retorno imediato: { runId }  (< 1s)                         │
│       └─ Supabase Realtime em agent_stream_events + agent_runs       │
└──────────────────────────────────────────────────────────────────────┘
        │ POST /agent-run
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│              agent-run/index.ts (ENTRYPOINT)                          │
│                                                                      │
│  actions: run, execute, cancel, pending_count                        │
│                                                                      │
│  Inngest dispatch (único executor durável)                           │
│    → POST /agent-run { action: "run" }                               │
│    → Inngest event (agent/build.requested | agent/plan.requested)    │
│    → POST /agent-run { action: "execute" } (service role)          │
│    → run-executor.ts → executeAgentRun()                             │
│    → run-job.ts → executeAgentJob() → AgentLoop.run()                │
│    → appendStreamEvent → agent_stream_events                         │
└──────────────────────────────────────────────────────────────────────┘
```

| Caminho | Status | Latência | Durabilidade |
|---------|--------|----------|--------------|
| Inngest + Realtime | ✅ ÚNICO | Retorno < 1s, execução background | Job durável, eventos no DB |

**Removidos:** PGMQ/agent-worker, Trigger.dev, useSSE, runChunkedJob inline, streamEventsResponse (poll 350ms).

---

## 2. BACKEND ⇄ FRONTEND: PARALELO DE RESPONSABILIDADES

### 2.1 Fluxo de Mensagem

| BACKEND | FRONTEND |
|---------|----------|
| `agent-run/index.ts`: auth, valida preferences, decide sessionKind | `ChatInput.tsx`: handleSend → useAgentRun.connect() |
| `agent-run/index.ts`: acquire_agent_run_lock() — INSERT atômico | `useAgentRun.ts`: POST /agent-run, recebe `{ runId }` |
| `agent-run/index.ts`: dispatch Inngest event + retorna { runId } | `useAgentRun.ts`: subscribe Realtime, `connected=true` |
| `run-executor.ts` → `executeAgentJob()` → loop executa | `useAgentRun.ts`: Realtime → `applyAgentProgressEvent()` |
| `loop.ts`: emite eventos (phase, tool_start, tool_done, assistant_text, done, finish) | `AgentProgress` state → `ChatStream.tsx` renderiza inline |
| `loop.ts`: markRunStatus("awaiting_user") — **preservado pelo finalizeRun corrigido** | ✅ Banner `awaiting-user` no ChatStream + subtítulo no header |
| `loop.ts`: plan_proposed → emit evento | `PlanViewer.tsx` ← `ChatStream.tsx` renderiza aprovação inline |

### 2.2 Streaming / Eventos

| BACKEND | FRONTEND |
|---------|----------|
| `agent-stream.ts`: appendStreamEvent() → agent_stream_events (DB) | `useAgentRun.ts`: postgres_changes INSERT em `agent_stream_events` |
| Catch-up uma vez ao subscribe (seq > lastSeq) | `agent-progress.ts`: reducer compartilhado |
| `agent_runs` UPDATE → status terminal | `useAgentRun.ts`: channel em `agent_runs` |
| Payload flat `{ type, phase, message, ... }` em `agent_stream_events` | `applyAgentProgressEvent` no reducer |

### 2.3 Sandbox E2B

| BACKEND | FRONTEND |
|---------|----------|
| `project-sandbox.ts`: ensureAgentProjectSandbox() — 1 por projeto | `PreviewFrame.tsx`: renderiza iframe com previewUrl |
| `e2b-smoke.ts`: createValidatedE2bSandbox() — smoke test Node/npm | `PreviewEmptyGuide.tsx`: estado vazio (Hammer + "LET'S BUILD") |
| `sandbox.ts`: E2BSandbox.ensure() — lazy init no 1º shell_exec | `PreviewFrame` / `usePreviewBoot` |
| `preview-boot/index.ts`: bootDevServerInSandbox() — sobe Vite | `PreviewFrame.tsx`: recebe `devUrl`, `bootError`, `warming`, `isNoFiles` |
| `e2b-health/index.ts`: smoke test de chave do usuário | SetupRail + `/api` (smoke ao salvar); badge live no editor = opcional (R4) |

### 2.4 Plan Mode

| BACKEND | FRONTEND |
|---------|----------|
| `loop.ts`: se planMode → router.classify() → extrai plano | `ComposerModeSelect.tsx`: toggle chat/plan/build |
| `loop.ts`: emit plan_proposed → markRunStatus("awaiting_plan_approval") | `PlanViewer.tsx`: renderiza steps + TTL countdown |
| `plan-decide.functions.ts` → novo run + Inngest | `index.tsx`: `planApprove` → `agent.watch(newRunId)` |
| `plan-mode.ts`: buildProposedPlan() — extrai rationale + steps | `PlanModal.tsx`: modal full-screen de aprovação |

### 2.5 Qualify (Interação)

| BACKEND | FRONTEND |
|---------|----------|
| `qualify.ts`: needsQualify() — detecta prompt vago/conversacional | Pergunta no chat + banner “Aguardando você” (resposta no input) |
| `qualify.ts`: padrões em português e inglês | Mesmo fluxo — sem modal Sim/Não (by design) |
| `loop.ts`: runQualifyPhase() → stopForUser=true → awaiting_user | Header: “Aguardando sua resposta”; `progress.awaiting` no reducer |
| `loop.ts`: finalizeRun não sobrescreve `awaiting_user` com completed | `index.tsx` não auto-boota preview quando `awaiting` |

### 2.6 Timeline de Execução

| BACKEND | FRONTEND |
|---------|----------|
| `loop.ts`: emite tool_start/tool_done com nome, args, resultado | `ConsoleLogStream.tsx`: log colapsável de tool calls |
| `loop.ts`: emite file_diff com before/after | `ChatDiffViewer.tsx`: diff inline no chat — ✅ funciona |
| `executionLogMeta.ts`: persiste hashes de tool calls | `ConsoleLogStream` no chat; `AuditLog` + replay na rota histórico |
| `observer.ts`: build, lint, tsc, design check | `ConsoleLogStream.tsx`: mostra `validate_fail` como log |
| `observer.ts`: `npm install` só se `package.json` existe e `node_modules` ausente no **sandbox FS** | ✅ `sandboxPathExists` |

---

## 3. INFRAESTRUTURA COMPLETA

### 3.1 Tabelas do Agente (28 migrations)

```sql
-- Tabelas core
agent_runs                 -- Cada execução do agente
  ├── status: 'pending'|'running'|'completed'|'failed'|'canceled'|'awaiting_user'
  ├── heartbeat_at          -- Detecção de runs zumbis
  ├── awaiting_user_type    -- 'qualify'|'plan'|null
  └── meta JSONB            -- provider, model, sessionKind, tokens, checkpoint, plan, etc.

agent_stream_events        -- Eventos persistidos (Realtime)
  ├── (run_id, seq) UNIQUE
  └── REPLICA IDENTITY FULL (realtime)

agent_pending_messages     -- Fila ATIVA quando agente ocupado (queueMessage)
agent_plans                 -- Planos faseados (steps JSONB)
agent_checkpoints           -- Persistência do estado do loop
  └── UNIQUE (project_id, conversation_id)

-- Funções
acquire_agent_run_lock()   -- pg_try_advisory_xact_lock — evita runs duplicadas
purge_agent_chunks_queue() -- Legado PGMQ (schema no DB, sem dispatch no agente)
```

### 3.2 Edge Functions (12 deployadas)

| Function | Rota | Papel |
|----------|------|-------|
| `agent-run` | `/agent-run` | **Entrypoint agente** (`run`, `execute`, `cancel`) |
| `preview-boot` | `/preview-boot` | Sobe Vite no E2B |
| `project-delete` | `/project-delete` | Remove projeto + sandbox |
| `e2b-health` | `/e2b-health` | Smoke test E2B do usuário |
| `e2b-cleanup` | `/e2b-cleanup` | Purga sandboxes órfãos |
| `health` | `/health` | Health check público |
| `connector-upsert` | `/connector-upsert` | CRUD de API keys |
| `deploy-publish` | `/deploy-publish` | Publicação |
| `admin-platform-secrets` | `/admin-platform-secrets` | Secrets globais |
| `github-import` | `/github-import` | Importa repo |
| `mcp-server` | `/mcp-server` | MCP tools |
| `voice-transcribe` | `/voice-transcribe` | Transcrição |

### 3.3 E2B — 5 camadas de integração

```
_shared/e2b.ts          ← API v2 REST (criar, listar, deletar, preview URL)
_shared/e2b-rest.ts     ← Connect Protocol (REST + envd relay)
_shared/e2b-smoke.ts    ← Validação (smoke test Node/npm por template)
_shared/user-e2b.ts     ← Chave BYOK do usuário (connectors kind=e2b)
_shared/project-sandbox.ts ← 1 sandbox por projeto, reuso, circuit breaker
```

### 3.4 Diretório `_shared/` — 28 arquivos

Agent (queue, stream, stuck), E2B (5 arquivos), Preview (dev, auto-publish), Skills (forge-skill-loader, session-extensions), Deploy (core, publish), Modelos (presets com 40+ providers), Infra (cors, logger, admin, secrets).

---

## 4. FRONTEND

### 4.1 Rotas (TanStack Router file-based)

| Rota | Componente | Linhas |
|------|-----------|--------|
| `/` | Landing page | Hero, Ticker, Features, Stats |
| `/projects/` | Dashboard de projetos | DashboardShell + ProjectsDashboard |
| `/projects/$projectId/` | **Editor principal** | **1254 linhas** — 18+ componentes integrados |
| `/projects/$projectId/history` | Histórico de execuções | AuditLog, TimelineScrubber |
| `/auth`, `/api`, `/api-keys`, `/models`, `/onboarding`, `/settings`, `/skills`, `/connectors`, `/costs`, `/mcp`, `/healthz` | Configuração | Diversos |

### 4.2 Componentes CONECTADOS (fluxo principal)

```
EditorPage → EditorShell → EditorResizableLayout
  ├── ChatInput → ChatStream → ConsoleLogStream, ChatDiffViewer, PlanViewer
  ├── FileTree (sidebar code view)
  ├── CodeEditor (Monaco)
  ├── PreviewFrame → PreviewEmptyGuide
  ├── AiDiffViewer → Monaco DiffEditor
  ├── LogPanel → TroubleshootingShotPanel
  ├── CommandPalette (⌘K)
  └── SetupRail → ActiveModelBadge, TasteSetupChecklist
```

### 4.3 Gaps conhecidos (backlog)

| Item | Detalhe |
|------|---------|
| ~~AiDiffViewer~~ | ✅ `before` via `progress.diffs` + `fileMap` |
| ~~Markdown~~ | ✅ `MarkdownRenderer` em ChatStream/ChatInput |
| ~~Setup duplicado~~ | ✅ `run-setup.ts` |

### 4.4 Removidos na higienização 2026-06-07

`useSSE`, `agent-worker`, Trigger.dev, SSE watch/replay, polling 350ms, e componentes órfãos do editor (AgentPanel, GitPanel, StatusBar, EditorModelControl, ProviderSelector, etc.). Ver tabela "Removido" em [FORGE.md](../FORGE.md).

---

## 5. Higienização concluída (2026-06-07)

- Circuito P0: Inngest → `appendStreamEvent` → Realtime → `useAgentRun`
- Edge: sem `runChunkedJob`, `streamEventsResponse`, actions `watch`/`replay`
- Frontend: sem `followQueuedRun` poll; reconnect via Realtime em `agent_runs`
- Inngest: guard `awaiting_user` em `agent-build.ts` / `agent-plan.ts`

---

## 6. BUGS PENDENTES

**Nenhum.** Fechados em 2026-06-07/08.

---

## 7. LEGADO NO DB

| Item | Ação |
|------|------|
| ~~PGMQ agent_chunks~~ | ✅ Removido (migration `20260611000000`) |
| `agent_pending_messages` | **Ativo** — fila de mensagens; UI: header + ChatStream |

---

## 8. CONVENÇÕES

- **Lock:** `acquire_agent_run_lock` — um run ativo por projeto/conversa
- **Streaming:** `appendStreamEvent` + evento terminal `finish` / `done`
- **Status:** nunca sobrescrever `awaiting_user` no finalize
- **UI:** Realtime only — sem polling compensatório
- **E2B:** sandbox só após projeto ter arquivos (guardas em `index.ts`)

---

## 9. BACKLOG

Tudo concluído — ver [FORGE.md](../FORGE.md). Editor modular: `useEditorPageData`, `useEditorPageHandlers`, `useEditorAgentOrchestration`, `EditorPageLayout`.
