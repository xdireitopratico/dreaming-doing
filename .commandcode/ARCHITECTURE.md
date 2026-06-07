# FORGE Agent System — Arquitetura Canônica (v2)

> Documento oficial. Toda sessão nova deve começar lendo isto.
> Gerado em 2026-06-07. Reflete o estado ATUAL após refatoração.

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
| `loop.ts`: markRunStatus("awaiting_user") — **preservado pelo finalizeRun corrigido** | ❌ Nenhum modal — atualmente o chat só mostra a mensagem |
| `loop.ts`: plan_proposed → emit evento | `PlanViewer.tsx` ← `ChatStream.tsx` renderiza aprovação inline |

### 2.2 Streaming / Eventos

| BACKEND | FRONTEND |
|---------|----------|
| `agent-stream.ts`: appendStreamEvent() → agent_stream_events (DB) | `useAgentRun.ts`: postgres_changes INSERT em `agent_stream_events` |
| Catch-up uma vez ao subscribe (seq > lastSeq) | `agent-progress.ts`: reducer compartilhado |
| `agent_runs` UPDATE → status terminal | `useAgentRun.ts`: channel em `agent_runs` |
| Formato SSE: sempre FLAT `{ type, phase, message, ... }` | `applyAgentProgressEvent`: espera formato flat |

### 2.3 Sandbox E2B

| BACKEND | FRONTEND |
|---------|----------|
| `project-sandbox.ts`: ensureAgentProjectSandbox() — 1 por projeto | `PreviewFrame.tsx`: renderiza iframe com previewUrl |
| `e2b-smoke.ts`: createValidatedE2bSandbox() — smoke test Node/npm | `PreviewEmptyGuide.tsx`: estado vazio (Hammer + "LET'S BUILD") |
| `sandbox.ts`: E2BSandbox.ensure() — lazy init no 1º shell_exec | ❌ `E2bSandboxPanel.tsx`: **ZERO imports** — componente construído mas não conectado |
| `preview-boot/index.ts`: bootDevServerInSandbox() — sobe Vite | `PreviewFrame.tsx`: recebe `devUrl`, `bootError`, `warming`, `isNoFiles` |
| `e2b-health/index.ts`: smoke test de chave do usuário | ❌ Nenhum indicador visual de saúde do E2B |

### 2.4 Plan Mode

| BACKEND | FRONTEND |
|---------|----------|
| `loop.ts`: se planMode → router.classify() → extrai plano | `ComposerModeSelect.tsx`: toggle chat/plan/build |
| `loop.ts`: emit plan_proposed → markRunStatus("awaiting_plan_approval") | `PlanViewer.tsx`: renderiza steps + TTL countdown |
| `index.ts`: action=plan_approve → resolvePlanDecision() | `useSSE.ts`: approvePlan() / rejectPlan() |
| `plan-mode.ts`: buildProposedPlan() — extrai rationale + steps | `PlanModal.tsx`: modal full-screen de aprovação |

### 2.5 Qualify (Interação)

| BACKEND | FRONTEND |
|---------|----------|
| `qualify.ts`: needsQualify() — detecta prompt vago/conversacional | ❌ Nenhum modal de decisão — atualmente a pergunta aparece como texto no chat |
| `qualify.ts`: padrões em português. **Inglês adicionado na refatoração**. | ❌ Chat comum — usuário precisa digitar resposta no input |
| `loop.ts`: runQualifyPhase() → stopForUser=true → awaiting_user | ❌ Status awaiting_user visível só no reducer, sem UI específica |
| `loop.ts`: **BUG CORRIGIDO** — finalizeRun não sobrescreve mais awaiting_user com completed | `AgentProgress.awaiting`: campo existe mas **nenhum componente lê** |

### 2.6 Timeline de Execução

| BACKEND | FRONTEND |
|---------|----------|
| `loop.ts`: emite tool_start/tool_done com nome, args, resultado | `ConsoleLogStream.tsx`: log colapsável de tool calls |
| `loop.ts`: emite file_diff com before/after | `ChatDiffViewer.tsx`: diff inline no chat — ✅ funciona |
| `executionLogMeta.ts`: persiste hashes de tool calls | ❌ Nenhum componente de timeline — `AgentTimeline.tsx` **NÃO EXISTE** |
| `observer.ts`: build, lint, tsc, design check | `ConsoleLogStream.tsx`: mostra `validate_fail` como log |
| `observer.ts`: **BUG** npm install todo ciclo (hasFile consulta Supabase, não sandbox FS) | — |

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

agent_stream_events        -- Eventos SSE persistidos (watch/replay)
  ├── (run_id, seq) UNIQUE
  └── REPLICA IDENTITY FULL (realtime)

agent_pending_messages     -- Fila quando agente ocupado
agent_plans                 -- Planos faseados (steps JSONB)
agent_checkpoints           -- Persistência do estado do loop
  └── UNIQUE (project_id, conversation_id)

-- Funções
acquire_agent_run_lock()   -- pg_try_advisory_xact_lock — evita runs duplicadas
purge_agent_chunks_queue() -- Limpa fila PGMQ zumbi
```

### 3.2 Edge Functions (13 deployadas)

| Function | Rota | Papel |
|----------|------|-------|
| `agent-run` | `/agent-run` | **Dispatcher principal** |
| `agent-worker` | `/agent-worker` | Consumer PGMQ (legado) |
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

## 4. FRONTEND: O QUE EXISTE E O QUE FALTA CONECTAR

### 4.1 Rotas (15, TanStack Router file-based)

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

### 4.3 Componentes ÓRFÃOS (16 — ZERO imports)

| Componente | Arquivo | O que faz |
|-----------|---------|-----------|
| **AgentPanel** | `editor/AgentPanel.tsx` | Barra de progresso do agente (fase, steps, statusHint, botão Continuar) |
| **E2bSandboxPanel** | `editor/E2bSandboxPanel.tsx` | Painel de status/configuração E2B (conectado/desconectado) |
| **EditorRail** | `editor/EditorRail.tsx` | Sidebar de ferramentas (Search, Files, History, Logs) |
| **AgentMemoryViewer** | `editor/AgentMemoryViewer.tsx` | Visualizador de memória do agente |
| **AutoHealingPanel** | `editor/AutoHealingPanel.tsx` | Painel de auto-recuperação de erros |
| **BranchSwitcher** | `editor/BranchSwitcher.tsx` | Switcher de branches git |
| **Breadcrumb** | `editor/Breadcrumb.tsx` | Caminho do arquivo (src > components > Button.tsx) |
| **GitPanel** | `editor/GitPanel.tsx` | Sidebar de git (stage/unstage/commit virtual) |
| **GlobalSearch** | `editor/GlobalSearch.tsx` | Busca global com regex, preview e replace (⌘⇧F) |
| **ForgeRulesEditor** | `editor/ForgeRulesEditor.tsx` | Editor visual de `.forgerules` |
| **PromptEnhancer** | `editor/PromptEnhancer.tsx` | Enhancer de prompt |
| **StatusBar** | `editor/StatusBar.tsx` | Barra inferior (git, build, custo, modelo) |
| **EditorReadinessStrip** | `editor/EditorReadinessStrip.tsx` | Barra de prontidão do agente |
| **EditorModelControl** | `editor/EditorModelControl.tsx` | Seletor de modelo/provider sempre visível |
| **MarkdownRenderer** | `ui/markdown-renderer.tsx` | Renderizador Markdown com CodeBlock (syntax highlighting) |
| **ToolCallDetails** | `ui/tool-call-details.tsx` | Detalhes de tool calls com ícone |

### 4.4 Duplicações e Gaps

| Problema | Detalhe |
|----------|---------|
| **MarkdownRenderer duplicado** | `ChatStream.tsx` e `ChatInput.tsx` têm `MarkdownContent` inline próprio → ignoram `ui/markdown-renderer.tsx`. Ambos têm a mesma lógica. |
| **AgentPanel redundante** | `ChatStream.tsx` implementa a mesma barra de progresso inline (`forge-chat-live`), tornando `AgentPanel.tsx` obsoleto. |
| **E2B sem indicador** | Preview lida com E2B internamente (boot spinner), sem usar `E2bSandboxPanel.tsx`. |
| **AiDiffViewer before vazio** | `diffEntries` são construídas de `tool_done` (sem `before`). Deveria usar `progress.diffs` (de `file_diff` SSE). |
| **AgentTimeline NÃO EXISTE** | Mencionado em discussões de arquitetura mas nunca implementado. |
| **useAgentRun** | `src/hooks/useAgentRun.ts` — hook Realtime ativo no editor; `useSSE.ts` removido. |
| **pendingQueueCount sem UI** | Campo existe no `AgentProgress`, é passado para `ChatStream`, mas **nenhum componente renderiza**. |

---

## 5. O QUE FOI CORRIGIDO (refatoração 2026-06-07)

| Arquivo | Bug | Correção |
|---------|-----|----------|
| `agent-run/index.ts` | `finalizeRun` sobrescrevia `awaiting_user` com `completed` (run corrompido) | Lê estado atual antes de decidir status; preserva `awaiting_user`/`awaiting_plan_approval`; `finished_at` fica null |
| `agent-run/index.ts` | Query `activeRun` não encontrava `completed` com `meta.awaitingUser` | Adicionado fallback: busca `completed` com `awaitingUser` e corrige status |
| `agent-run/index.ts` | Guarda enfileirava resposta do usuário como `pending` em vez de criar run de continuação | `isAwaiting` não enfileira — cria run novo |
| `agent-run/index.ts` | `buildState()`, `makeLoop()`, `stubReg` — código morto | Removidos (~80 linhas) |
| `agent-run/index.ts` | Formato SSE inline com nesting (`{ type, data }`) | Corrigido para flat (`{ type, ...data }`) — igual ao worker |
| `agent-worker/index.ts` | `finalizeRun` fazia COMPLETE REPLACEMENT do meta | Agora faz merge (`...currentMeta`) |
| `agent-worker/index.ts` | `drainPendingMessage` podia corromper run bem-sucedido (exceção caía no catch) | Try/catch próprio, não re-finaliza |
| `agent-worker/index.ts` | `drainPendingMessage` bypassava advisory lock | Usa `acquire_agent_run_lock` RPC |
| `agent-worker/index.ts` | Pending message deletada mesmo quando PGMQ falha | Só deleta se `enqueueAgentChunk` retorna `true` |
| `agent-worker/index.ts` | Re-enqueue falha → run abandonado | Finaliza com erro explícito |
| `agent-worker/index.ts` | Catch block sobrescrevia cancel como failed | Verifica `canceled_at` antes de finalizar |
| `agent-worker/index.ts` | Sem heartbeat | `heartbeat_at` atualizado a cada chunk |
| `_shared/agent-queue.ts` | `pop()` atômico perde mensagem no crash | `read()` com visibility timeout 120s + `delete()` explícito |
| `_shared/agent-queue.ts` | `invokeAgentWorker` não verificava `response.ok` | Agora verifica e loga |

---

## 6. BUGS CONHECIDOS (pendentes de correção)

### Backend

| # | Severidade | Arquivo | Bug |
|---|-----------|---------|-----|
| 1 | **Alta** | `index.ts` → `streamEventsResponse` | **Polling eterno**: 350ms × 45min = ~7,700 queries mesmo sem eventos. Sem detecção de `awaiting_user`. |
| 2 | **Alta** | `observer.ts` | npm install todo ciclo de validação (`hasFile("node_modules")` consulta Supabase, não sandbox FS) |
| 3 | **Alta** | `observer.ts` | `npx tsc --noEmit` sem `--project tsconfig.json` → falsos positivos em path aliases |
| 4 | **Alta** | `loop.ts` | `forceTools` descarta resposta do assistant (`continue` sem push no messages) |
| 5 | **Média** | `loop.ts` | Duas injeções de stuck detection simultâneas (reativo + proativo) |
| 6 | **Média** | `checkpoint.ts` | `resumeStepStart` retorna `currentStepIndex - 1` → re-execução de step |
| 7 | **Média** | `router.ts` | Classify silent fallback retorna complexity:3 fixo |
| 8 | **Média** | `sandbox.ts` | `destroy()` não destrói (só zera ref local). `kill()` não limpa `previewSandboxId` do meta |
| 9 | **Baixa** | `sandbox.ts` | Timeout de 30min do E2B sem renovação via `e2bConnectSandbox()` |
| 10 | **Baixa** | `loop.ts` | `gatherContext` pode lançar sem try/catch |
| 11 | **Baixa** | `loop.ts` | `persistFinal` pode lançar e quebrar return path |

### Frontend

| # | Severidade | Arquivo | Bug |
|---|-----------|---------|-----|
| 12 | **Alta** | `routes/$projectId/index.tsx` | AiDiffViewer `before` sempre vazio (usa `tool_done`, não `file_diff`) |
| 13 | **Média** | `ChatStream.tsx`, `ChatInput.tsx` | MarkdownContent duplicado — ignora `ui/markdown-renderer.tsx` |
| 14 | **Média** | `useSSE.ts` | Marcado `@deprecated` mas substituto `useAgentRun.ts` não existe |
| 15 | **Baixa** | `AgentPanel.tsx` | Redundante — mesma funcionalidade implementada inline no `ChatStream` |
| 16 | **Baixa** | `E2bSandboxPanel.tsx` | Componente pronto mas nunca conectado |
| 17 | **Baixa** | Vários | 16 componentes com ZERO imports — construídos e abandonados |

---

## 7. CÓDIGO MORTO (confirmado)

| Item | Localização | Impacto |
|------|------------|---------|
| `buildState()` | `agent-run/index.ts` | **Removido** na refatoração |
| `makeLoop()` | `agent-run/index.ts` | **Removido** na refatoração |
| `stubReg` | `agent-run/index.ts` | **Removido** na refatoração |
| `agent-run/worker/` | Diretório vazio (0 arquivos) | Inócuo |
| Duplicação de setup | `index.ts` + `run-executor.ts` + `run-job.ts` | ~300 linhas repetidas (keys, provider, robin pool) |

---

## 8. PATTERNS E CONVENÇÕES

- **Nunca confiar em estado em memória entre instâncias** → usar `pg_try_advisory_xact_lock`
- **PGMQ: nunca usar read+delete separados** → `read()` com visibility timeout + `delete()` explícito
- **E2B: criar sandbox só quando há output** → verificar file count antes
- **Frontend: sempre normalizar formato de eventos** → reducer já faz isso (flat vs nested)
- **Catch block: sempre verificar estado atual antes de sobrescrever** → checar `canceled_at`, `status`
- **Streaming: sempre emitir `finish`/`done` para fechar o ciclo** → evita polling eterno
- **finalizeRun: nunca sobrescrever status de espera** → preservar `awaiting_user`/`awaiting_plan_approval`

---

## 9. PRÓXIMOS PASSOS (priorizados)

1. **Corrigir polling eterno** no `streamEventsResponse` (bug #1) — detectar `awaiting_user`, emitir `done`, fechar stream
2. **Corrigir observer** (bugs #2, #3) — npm install cache + tsc com --project
3. **Corrigir loop** (bugs #4, #5, #6) — forceTools, stuck detection, checkpoint resume
4. **Conectar frontend** (bugs #12, #13) — AiDiffViewer + MarkdownRenderer
5. **Criar AgentTimeline** — componente de timeline de raciocínio (substitui chat durante execução)
6. **Criar useAgentRun** — substituir useSSE deprecated
7. **Limpar órfãos** — decidir destino dos 16 componentes com ZERO imports
