# Auditoria — Contrato de Jornada (2026-06-22)

> **Escopo:** Chat · Inspector/Timeline · Runtime · Control Plane  
> **Método:** 4 subagentes de exploração + leitura cruzada de código  
> **Veredito:** Testes unitários passam; **produto quebrado**. Gates atuais mentem.

---

## 1. O que funciona hoje (preservar)

| Componente | Evidência |
|------------|-----------|
| `ChatComposer` + mode select | `ChatComposer.tsx`, `ComposerModeSelect.tsx` |
| `ChatPlanDock` (aprovar/rejeitar plano) | `ChatPlanDock.tsx`, `lovable-acceptance.test.ts` |
| Editor `sendMessage` → `connect` → Realtime | `send-message.ts`, `useAgentRun.ts` |
| Reducer `applyAgentProgressEvent` | `agent-progress.ts` + 49 testes |
| `agent_stream_events` + seq | `useAgentRun.subscribeToRun` |
| `RuntimeEmitter` (Fase 2.1) | `runtime/emitter.ts` + 9 testes Deno |
| `transitionRun` módulo | `run-lifecycle.ts` (parcialmente adotado) |
| Fixture Lovable `/dev/lovable-chat` | Oráculo visual da UX alvo |

---

## 2. Sintomas do usuário → causa raiz

| Sintoma | Causa raiz | Arquivo(s) |
|---------|------------|------------|
| Dashboard → editor, LLM morto | `PromptEngine` dispara `invoke` fora do pipeline; erros `.catch(()=>{})`; reconcile one-shot perde race | `PromptEngine.tsx:125-133`, `useAgentRunReconcile.ts:37-49` |
| Sem "Pensando…" | `ForgeThinking` existe no inspector, **não** no chat; teste exige `thinking` undefined | `AssistantTurn.tsx`, `invariants.test.ts:98-117` |
| Card parado minutos (robin) | Eventos `robin_wait` sem UX; `phase` com `message: ""`; silêncio até fechamento | `loop.ts`, `robin-pool.ts` |
| Sem introdução antes do card | `emitOpeningToChat("")` é no-op; opening não obrigatório em plan mode | `loop.ts:1123-1127`, `3002-3005` |
| 2ª mensagem morre | Checkpoint materializa cedo → live slot liberado → stream continua invisível | `assistant-materialized.ts`, `useChat.ts`, `loop.ts:2755` |
| Timeline só web research | `tool_done` ignorado pelos builders; checkpoint congela snapshot | `timeline-builder.ts`, `forge-run.ts` |
| Mensagens hardcore / vazias | `TOOL_NUDGE=""` ainda empurra histórico; LLM fail retorna `""` e marca completed | `tool-progress.ts:5`, `conversational.ts`, `loop.ts:725-731` |

---

## 3. Três eixos — estado real

### Chat (frontend)

- **2 caminhos de dispatch:** dashboard `invoke` vs editor `sendMessage`/`connect`
- **`agent-auto-run.ts`:** escrito, nunca ligado
- **Jornada DOM documentada** (`thought → narration → card → prose`) **não renderizada**
- **~15 campos/caminhos mortos:** `statusChips`, `phaseMessage`, `thinking?: boolean`, etc.

### Inspector / timeline

- **3 builders de timeline** (`timeline-builder`, `forge-run`, `agent-job-stream` morto)
- **Inspector ≠ chat:** resolução de progresso diferente após checkpoint
- **`tool_done`:** reducer processa; UI ignora

### Runtime (backend)

- **3069 LOC** `loop.ts` (meta <500)
- **4 writers** de `agent_runs.status` (loop, executor, Inngest, edge)
- **Double `finish`** em tool-miss (`loop.ts:1095` + `run-executor.ts:515`)
- **3 camadas** de chunk resume (loop + Inngest 3× + redispatch)
- **14+ `phase` com message vazio**

### Control plane

- **Fase 0 ~55%** efetivo (lógica ok, gates fracos)
- **Fase 1 ~35%** (schema + shadow; execução ainda v1)
- **`AGENT_RUNTIME_V2`:** provavelmente off em prod
- **Smoke passa em `running`** — não exige `completed`
- **`check:agent-metrics`:** non-blocking no deploy

---

## 4. Contrato de Jornada (definição de "pronto")

### Por turno (Lovable)

```
0. Envio     → user message + imediato "Pensando…" (UI otimista)
1. Thought   → "Pensou por Xs" OU streaming thinking_text
2. Abertura  → 1 frase LLM ligada ao pedido (opening: true)
3. Trabalho  → mini-card vivo (header/subtitle rotacionando)
4. Inspector → mesma timeline que o card (stream ao vivo)
5. Fechamento→ prosa final só após job terminar
6. Materialização → 1 assistant message no DB (terminal)
```

### Invariantes técnicas

1. **Um dispatch:** todo envio passa `sendMessage` / `connect` com `preferences`
2. **Um stream live:** durante run, só `agent_stream_events` + reducer
3. **Checkpoint ≠ terminal:** `meta.checkpoint` nunca libera live slot
4. **Um finish:** exatamente um evento `finish` por run
5. **Um builder:** `buildForgeTimeline` para chat + inspector
6. **Deletar, não esconder:** sem `""` como fallback de mensagem

### Prova de fechamento (gate real)

- [ ] Dashboard prompt → editor: pensando em <2s, run conecta
- [ ] Plan mode: abertura → card → fechamento (1º turno)
- [ ] 2º turno: mesma jornada
- [ ] F5 mid-run: timeline recupera do stream
- [ ] Inspector atualiza durante run (não congela em web research)
- [ ] `/dev/lovable-chat` paridade com produção no turno ativo

---

## 5. Matriz consolidada P0 / P1 / P2

### P0 — Desbloqueia experiência

| ID | Fix | Arquivos |
|----|-----|----------|
| P0-CHAT-1 | Remover `invoke` do PromptEngine; ligar `agent-auto-run` + coordinator | `PromptEngine.tsx`, `useAgentSessionCoordinator.ts`, `agent-auto-run.ts` |
| P0-CHAT-2 | Reconcile com retry + realtime INSERT | `useAgentRunReconcile.ts` |
| P0-CHAT-3 | Render `ForgeThinking` em `AssistantTurn` | `AssistantTurn.tsx`, `turn.ts`, `turn-display.ts` |
| P0-INS-1 | Checkpoint não materializa (`checkpoint`/`betweenChunks`) | `assistant-materialized.ts`, `useChat.ts` |
| P0-INS-2 | `tool_done` no builder unificado | `timeline-builder.ts` / `forge-run.ts` |
| P0-INS-3 | Inspector usa `pickRicherProgress` (não DB cego) | `assistant-run-progress.ts` |
| P0-RT-1 | Remover double `finish` | `loop.ts:1095` |
| P0-RT-2 | Um writer de status (loop sai) | `loop.ts:2122-2158`, `run-executor.ts` |
| P0-RT-3 | Plan resume não cai em build error | `loop.ts:669-860` |
| P0-GATE-1 | Smoke exige terminal honesto ou chunk_resume explícito | `smoke-agent-e2e.mjs` |

### P1 — Contrato completo

| ID | Fix |
|----|-----|
| P1-CHAT-1 | `beginPendingTurn` no bootstrap dashboard |
| P1-CHAT-2 | Deletar `statusChips`, `phaseMessage`, aliases mortos |
| P1-CHAT-3 | Reverter teste "sem thinking" |
| P1-RT-1 | `chunk_resume.maxAttempts` = 12 |
| P1-RT-2 | Emitir `phase: gather`, opening obrigatório |
| P1-RT-3 | Fallback PT em LLM fail (não `""` + completed) |
| P1-RT-4 | Deletar push de `TOOL_NUDGE` vazio |
| P1-INS-1 | Merge `buildTimeline` + `buildForgeTimeline` |
| P1-CP-1 | Stale gate usa `shouldSkipStaleExpiry` |
| P1-CP-2 | `check:shadow-parity` + metrics blocking em staging |

### P2 — Demolição (após contrato verde)

| ID | Fix |
|----|-----|
| P2-RT | Fase 2.2+ phases (não antes) |
| P2-CP | Fase 1.5 job worker real |
| P2-FE | Decompor `useAgentRun` em hooks |
| P2-DEL | `agent-job-stream` tree, `runningLocks`, Fase 4.7 dead em `index.ts` |

---

## 6. Código para DELETAR (não mascarar)

| Item | Local |
|------|-------|
| `PromptEngine` fire-and-forget invoke | `PromptEngine.tsx:125-133` |
| `TOOL_NUDGE_MESSAGE = ""` + push vazio | `tool-progress.ts`, `loop.ts:2287` |
| `emitOpeningToChat("")` | `loop.ts:1123-1127` |
| Empty reply `ok:true` branches | `loop.ts:725-731`, `1952-1961` |
| `buildJobStreamTree` (UI morto) | `agent-job-stream.ts` |
| `statusChips` sempre `[]` | `turn.ts`, types |
| `runningLocks` edge | `index.ts:31,444` |
| `stackCtx`/`stackAddon` não usados | `index.ts:763-773` |
| Comentário `resolveTurnThinking` fantasma | `agent-progress.ts:391` |

---

## 7. Gates que mentem hoje

| Gate | Problema |
|------|----------|
| Vitest 426 pass | Não exercita dashboard→editor nem browser |
| Deno loop 48 pass | Contrato de eventos, não jornada UX |
| `smoke-agent-e2e` | Passa em `running` sem `completed` |
| `check-stale-runs` | Ignora `betweenChunks` |
| `check:agent-metrics` | Non-blocking; denominador exclui running |
| `check:shadow-parity` | Exit 0 se shadow off |

**Novo gate obrigatório:** `agent-turn-flow` + checklist browser §4 + smoke terminal.

---

*Auditoria viva. Próximo passo: executar Fase S do master plan (itens P0).*