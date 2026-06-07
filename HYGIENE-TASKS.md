# FORGE — Lista Atômica de Higienização

> **SSOT de decisões.** Cada linha = uma ação: **APAGAR**, **CONECTAR**, ou **MANTER**.
> Atualizado: 2026-06-07. Caminho canônico: **Inngest → DB → Realtime** (sem polling, sem SSE).

## Legenda

| Status | Significado |
|--------|-------------|
| ✅ | Feito |
| 🔄 | Em andamento nesta sessão |
| ⏳ | Pendente (decisão ou implementação) |
| — | N/A / cancelado |

---

## A. Caminhos de execução do agente

| # | Item | Ação | Status | Notas |
|---|------|------|--------|-------|
| A1 | Inngest (`src/inngest/`, `api/inngest.js`) | MANTER | ✅ | Executor durável |
| A2 | `execute` → `run-executor.ts` + `appendStreamEvent` | CONECTAR | ✅ | `onEvent` persiste no DB |
| A3 | `run` → JSON `{ runId }` | MANTER | ✅ | Contrato P0 |
| A4 | `runChunkedJob` inline no Edge | APAGAR | ✅ | Removido de `index.ts` |
| A5 | PGMQ + `agent-worker` | APAGAR | ✅ | Função e dispatch removidos |
| A6 | `_shared/agent-queue.ts` | APAGAR | ✅ | Removido |
| A7 | Migrations PGMQ no DB | MANTER schema / APAGAR uso | ✅ | Schema fica; código não usa |
| A8 | Trigger.dev (config, deps, tasks) | APAGAR | ✅ | Fora do `package.json` |
| A9 | `streamEventsResponse` (SSE poll 350ms) | APAGAR | ✅ | Removido; Realtime only |

## B. Backend — arquivos e duplicação

| # | Item | Ação | Status | Notas |
|---|------|------|--------|-------|
| B1 | Setup duplicado (`index` + `run-executor` + `run-job`) | CONECTAR → `run-setup.ts` | ⏳ | ~300 linhas duplicadas |
| B2 | `appendStreamEvent` no `run-executor` | CONECTAR | ✅ | Todo `onEvent` persiste |
| B3 | `agent-run/worker/` vazio | APAGAR | ✅ | Removido |
| B4 | Inngest `mark-completed` + guard `awaiting_user` | CONECTAR | ✅ | `agent-build.ts` / `agent-plan.ts` |
| B5 | `observer.ts` npm/tsc | CONECTAR (fix) | ⏳ | Pós-circuito |
| B6 | `loop.ts` forceTools / checkpoint | CONECTAR (fix) | ⏳ | Pós-circuito |
| B7 | `health` no `deploy-all.sh` | CONECTAR | ✅ | Deploy inclui `health` |

## C. Frontend — hooks

| # | Item | Ação | Status | Notas |
|---|------|------|--------|-------|
| C1 | `useSSE.ts` | APAGAR | ✅ | Removido |
| C2 | `useAgentRun.ts` no editor | CONECTAR | ✅ | `index.tsx` usa |
| C3 | `agent-progress.ts` (reducer) | CONECTAR | ✅ | Extraído; testes em `agent-progress.test.ts` |
| C4 | `src/lib/agent-stream.ts` (duplicata front) | APAGAR | ✅ | Nunca existiu / removido |
| C5 | `useShadowWorkspace.ts` | APAGAR | ✅ | Removido |
| C6 | `useAgentBlame` | MANTER | ✅ | Conectado |
| C7 | Modo `"chat"` legado no hook morto | APAGAR | ✅ | Com C1 |

## D. Componentes editor órfãos

| # | Componente | Ação | Status | Notas |
|---|------------|------|--------|-------|
| D1 | `AgentPanel.tsx` | APAGAR | ✅ | Removido |
| D2 | `AutoHealingPanel.tsx` | APAGAR | ✅ | Removido |
| D3 | `AgentMemoryViewer.tsx` | APAGAR | ✅ | Removido |
| D4 | `E2bSandboxPanel.tsx` | APAGAR | ✅ | Removido |
| D5 | `EditorRail.tsx` | APAGAR | ✅ | Removido |
| D6 | `GitPanel.tsx` | APAGAR | ✅ | Removido |
| D7 | `BranchSwitcher.tsx` | APAGAR | ✅ | Removido |
| D8 | `GlobalSearch.tsx` | APAGAR | ✅ | Removido |
| D9 | `ForgeRulesEditor.tsx` | APAGAR | ✅ | Removido |
| D10 | `PromptEnhancer.tsx` | APAGAR | ✅ | Removido |
| D11 | `Breadcrumb.tsx` | APAGAR | ✅ | Removido |
| D12 | `EditorReadinessStrip.tsx` | APAGAR | ✅ | Removido |
| D13 | `EditorViewTabs.tsx` (componente) | APAGAR | ✅ | Type → `editor-views.ts` |
| D14 | `EditorModelControl.tsx` | APAGAR | ✅ | Órfão — sem mount |
| D15 | `StatusBar.tsx` | APAGAR | ✅ | Órfão — sem mount |
| D16 | `ProviderSelector.tsx` | APAGAR | ✅ | Só usado por D14 |
| D17 | `RateLimitIndicator.tsx` | APAGAR | ✅ | Import fantasma (comentário) |
| D18 | `SnapshotsSheet.tsx` | APAGAR | ✅ | Import fantasma (comentário) |
| D19 | `AiDiffViewer.tsx` fix `progress.diffs` | CONECTAR | ⏳ | `before` vazio |

## E. UI shared

| # | Item | Ação | Status |
|---|------|------|--------|
| E1 | `ui/markdown-renderer.tsx` | CONECTAR em ChatStream | ⏳ |
| E2 | `ui/tool-call-details.tsx` | APAGAR | ✅ | Não existe no repo |

## F. Edge functions

| # | Function | Ação | Status |
|---|----------|------|--------|
| F1 | `agent-run` | MANTER | ✅ |
| F2 | `agent-worker` | APAGAR | ✅ |
| F3–F8 | preview-boot, deploy, github, voice, mcp, e2b-* | MANTER | ✅ |
| F9 | `health` no deploy | CONECTAR | ✅ |

## G. Documentação

| # | Arquivo | Ação | Status |
|---|---------|------|--------|
| G1 | `.commandcode/ARCHITECTURE.md` | MANTER + atualizar | ✅ |
| G2 | `AGENT.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | APAGAR Trigger → ponte FORGE | ✅ |
| G3 | `.ruler/trigger-*` cópias | APAGAR | ⏳ | Não versionar |
| G4 | `dreaming-doing-BLACKBOX.md` | APAGAR | ⏳ | Se existir |
| G5 | `opencode.md` | MANTER + atualizar | ⏳ |
| G6 | `doc.md` | MANTER backlog | ⏳ |
| G7 | `README.md` | MANTER + link FORGE | ⏳ |
| G8 | `FORGE.md` | CONECTAR | ✅ |
| G9 | **`HYGIENE-TASKS.md` (este arquivo)** | CONECTAR | ✅ |

## H. Artefatos e deps

| # | Item | Ação | Status |
|---|------|------|--------|
| H1 | `@trigger.dev/*` no lock | APAGAR | ✅ | `npm install` limpa lock |
| H2 | `dogfood-output/` | APAGAR | ✅ | Screenshots de sessão |
| H3 | `dist/` versionado | APAGAR | ✅ | No `.gitignore` |
| H4 | `bun.lock` + `package-lock.json` | DECIDIR | ⏳ | npm canônico |

## I. Fios quebrados (circuito P0)

| # | Desconexão | Ação | Status |
|---|------------|------|--------|
| I1 | POST JSON `{ runId }` + Realtime (não SSE) | CONECTAR | ✅ |
| I2 | Loop → `appendStreamEvent` | CONECTAR | ✅ |
| I3 | `useAgentRun` no editor | CONECTAR | ✅ |
| I4 | `clearPendingPlan` após approve/reject | CONECTAR | ✅ |
| I5 | `planApprove` → `watch(newRunId)` | CONECTAR | ✅ |
| I6 | `followQueuedRun` polling 500ms | APAGAR | ✅ | → Realtime em `agent_runs` |

---

## Sprints

### Sprint 1 — Apagar lixo
- [x] A5, A6, A8, B3, C1, C4, C5, D1–D12, F2, FORGE.md
- [x] A4, A9 (SSE/polling Edge)
- [x] D13–D18, H2, G2, I6
- [ ] G3, G4, G5, G6, G7

### Sprint 2 — Circuito P0
- [x] B2, B4, C2, C3, I1–I5
- [x] Realtime only no `useAgentRun` (sem polling)
- [ ] B1 (`run-setup.ts`)

### Sprint 3 — Polish
- [ ] D19, E1, B5, B6
- [ ] Decidir reconectar D14–D18 ou manter apagados

## Teste de aceite

1. Mensagem → streaming via Realtime (sem poll)
2. `SELECT count(*) FROM agent_stream_events WHERE run_id = ?` > 1
3. Plan → approve → novo run com `watch`
4. Stop cancela e emite `canceled` + `finish`
5. `npm run typecheck && npm test` verde
6. LLM fresco lê `FORGE.md` — zero menção a PGMQ / Trigger / useSSE