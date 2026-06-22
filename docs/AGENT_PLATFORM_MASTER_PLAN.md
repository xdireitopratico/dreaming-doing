# Agent Platform — Master Engineering Plan

> **Status:** Auditoria 2026-06-22 concluída · execução reiniciada em **Fase S**  
> **Data:** 2026-06-21 (plano) · 2026-06-22 (auditoria + replanejamento)  
> **Horizonte:** Contrato de Jornada verde → depois demolição controlada  
> **Métrica norte:** Usuário completa turno no browser (dashboard→editor→plan→2º turno) sem intervenção

**Auditoria detalhada:** [`docs/superpowers/plans/2026-06-22-journey-contract-audit.md`](superpowers/plans/2026-06-22-journey-contract-audit.md)

---

## 0. Verdade pós-auditoria (2026-06-22)

### O que os testes NÃO provam

| Gate atual | Passa? | Mentira |
|------------|--------|---------|
| Vitest 426 | ✅ | Não cobre dashboard→editor, nem browser |
| Deno loop 48 + emitter 9 | ✅ | Contrato de eventos, não jornada UX |
| `smoke-agent-e2e` | ⚠️ | Aceita `running` sem `completed` |
| `check:agent-metrics` | ⚠️ | Non-blocking no deploy; ~53% failed histórico |
| `check:shadow-parity` | ⚠️ | Exit 0 se `AGENT_RUNTIME_V2` off |

### O que o usuário vive hoje

| Sintoma | Causa (evidência em código) |
|---------|----------------------------|
| Dashboard → editor, LLM morto | `PromptEngine` `invoke` paralelo + reconcile one-shot (`PromptEngine.tsx:125-133`) |
| Sem "Pensando…" | `ForgeThinking` só no inspector; teste proíbe thinking no chat |
| Card parado / silêncio 2min | Eventos vazios + sem heartbeat UX; `phase: ""` |
| Sem abertura antes do card | `emitOpeningToChat("")` no-op |
| 2º turno / timeline morre | Checkpoint materializa cedo → live slot liberado |
| Timeline só web research | `tool_done` ignorado; snapshot truncado |

### Estado real das fases (honesto)

| Fase | % real | Notas |
|------|--------|-------|
| **0** Parar hemorragia | ~55% | Lógica chunk ok; gates fracos |
| **1** Control plane | ~35% | `agent_jobs` schema + shadow; execução ainda v1 |
| **2** Runtime decomposto | ~8% | Só 2.1 `RuntimeEmitter` |
| **3** Frontend | ~15% | Composer/plan ok; jornada quebrada |
| **S** Contrato Jornada | **0%** | **Nova fase prioritária** |

### Decisão estratégica (revisada)

1. **PAUSAR** Fase 2.2+ (demolir `loop.ts`) até jornada browser verde.  
2. **PAUSAR** `agent_jobs` executor real (shadow continua observabilidade).  
3. **EXECUTAR** Fase S — contrato de jornada ponta a ponta, deletar lixo, gates honestos.  
4. **Depois** retomar Fase 1.5 → 2 → 3 na ordem original.

---

## 1. Contrato de Jornada (definição de "pronto")

Referência visual: `/dev/lovable-chat` · testes: `lovable-acceptance.test.ts`, `agent-turn-flow.test.ts`

### Por turno assistant

```
0. Envio      → user message + "Pensando…" imediato (beginPendingTurn)
1. Thought    → "Pensou por Xs" / streaming thinking_text
2. Abertura   → 1 frase LLM (opening: true) antes do card
3. Trabalho   → mini-card vivo (Working → Edited file → Running command)
4. Inspector  → mesma timeline, tempo real
5. Fechamento → prosa só após job (invariante Lovable)
6. Terminal   → 1 message assistant materializada
```

### Invariantes técnicas (constituição revisada)

1. **Um dispatch** — `sendMessage` / `connect`; zero `invoke` paralelo.
2. **Um stream live** — `agent_stream_events` + reducer durante run.
3. **Checkpoint ≠ terminal** — `meta.checkpoint` / `betweenChunks` não libera slot.
4. **Um finish** — um evento `finish` por run (executor único).
5. **Um status writer** — `transitionRun` só no executor/Inngest (loop sai).
6. **Um timeline builder** — chat + inspector compartilham `buildForgeTimeline`.
7. **Deletar, não esconder** — proibido `""` como fallback de mensagem user-facing.

### Gate de fechamento Fase S (browser + CI)

- [ ] Dashboard prompt → editor: pensando <2s, run conecta sem reenviar
- [ ] Plan mode 1º turno: thought → abertura → card → fechamento
- [ ] 2º turno: mesma jornada
- [ ] F5 mid-run: timeline = stream catch-up
- [ ] Inspector não congela após web_research
- [ ] `agent-turn-flow` + smoke terminal verdes

---

## 2. Princípios de engenharia

1. **Jornada antes de arquitetura** — browser verde > LOC reduzidas.
2. **Uma fonte de verdade por conceito** — status, eventos, timeline, dispatch.
3. **Mentira zero na UX** — silêncio > mensagem hardcore falsa.
4. **Teste que importa** — E2E jornada bloqueia merge; unit é suporte.
5. **Deletar código morto** — `""` e branches unreachable saem no mesmo PR.
6. **Demolição controlada** — só após Fase S; flag v2 até paridade.
7. **Arquivos <800 linhas** — após contrato, não durante estabilização.

---

## 3. Arquitetura alvo (v2) — inalterada em visão, repriorizada em execução

```
UI: useAgentSession · useAgentStream · reducer · AssistantTurn (Thought→…→closing)
     ↓ POST agent-run (thin edge, preferences obrigatórias)
Control: agent_runs · agent_jobs (shadow) · agent_stream_events · pending_messages
     ↓ 1 chunk / 1 Inngest event (Fase 1.5 — após S)
Execution: AgentRuntime.runChunk() (Fase 2 — após 1.5)
```

Detalhes: §3.2–3.7 do plano original (agent_jobs, lifecycle, decomposição loop, hooks) permanecem válidos como **destino**, não como **próximo passo**.

### O que preservamos

| Componente | Por quê |
|------------|---------|
| `ChatComposer`, `ChatPlanDock` | Funcionam |
| `agent_stream_events` + Realtime | Spine correto |
| `applyAgentProgressEvent` | Reducer testado |
| `RuntimeEmitter` | Fase 2.1 feita |
| `packages/agent-contract` (events + lifecycle) | SSOT parcial |
| `/dev/lovable-chat` | Oráculo UX |

### O que demolimos (Fase S + depois)

| Componente | Quando | Substituto |
|------------|--------|------------|
| `PromptEngine` invoke paralelo | **S.1** | `agent-auto-run` + `connect` |
| `buildTimeline` duplicado | **S.4** | `buildForgeTimeline` único |
| `agent-job-stream` tree UI | **S.4** | delete |
| `statusChips`, `phaseMessage` mortos | **S.2** | delete |
| `TOOL_NUDGE=""` + push vazio | **S.3** | delete branch |
| `loop.markRunStatus` | **S.3** | executor only |
| `runningLocks` edge | P2 | DB lock only |
| `loop.ts` monólito | Fase 2 | `runtime/phases/*` |

---

## 4. Roadmap revisado

### Fase S — Contrato de Jornada (AGORA) · ~80h

**Objetivo:** experiência Lovable no browser; gates honestos.

| # | Entrega | Auditoria ref |
|---|---------|---------------|
| S.1 | **Dispatch único** — dashboard usa `agent-auto-run` + editor `connect`; remove `invoke` | P0-CHAT-1,2 |
| S.2 | **Thought no chat** — `ForgeThinking` em `AssistantTurn`; `mapAssistantTurn` | P0-CHAT-3 |
| S.3 | **Runtime fala** — opening, gather phase, LLM fail fallback, no double finish | P0-RT-1,2,3 |
| S.4 | **Inspector vivo** — checkpoint não materializa; `tool_done`; builder único | P0-INS-1,2,3 |
| S.5 | **Gates honestos** — smoke terminal; stale aware; journey E2E blocking | P0-GATE-1 |
| S.6 | **Delete pass** — lista §6 da auditoria | — |

**Critério de saída:** Gate §1 completo no browser staging.

---

### Fase 0 — Parar hemorragia · ~40h (paralelo S.3/S.5)

| # | Status | Entrega |
|---|--------|---------|
| 0.1 | ✅ código | Plan mode `resumable` |
| 0.2 | ✅ código | Inngest re-dispatch |
| 0.3 | ⚠️ | Stale-aware (lógica ok, gate CI mente) |
| 0.4 | ❌ | Smoke blocking real |
| 0.5 | ⚠️ | Deploy script (metrics warn only) |

**Critério:** 7d failed <25% **com smoke que exige completed**.

---

### Fase 1 — Control Plane · ~120h (após S verde)

| # | Status | Entrega |
|---|--------|---------|
| 1.1 | ✅ | Migration `agent_jobs` |
| 1.2 | ⚠️ | `agent-contract` (2/7 mirrors) |
| 1.3 | ⚠️ | `transitionRun` (4 writers ainda) |
| 1.4 | ✅ shadow | Edge enqueue job |
| 1.5 | ❌ | 1 job/chunk worker real |
| 1.6 | ✅ código | Shadow mode |
| 1.7 | ✅ | Chat mode UX |

**Critério:** 100 runs shadow parity; 0 divergência terminal.

---

### Fase 2 — Runtime decomposto · ~160h (após 1.5)

| # | Status | Entrega |
|---|--------|---------|
| 2.1 | ✅ | `runtime/emitter` |
| 2.2–2.5 | ❌ | phases, orchestrator, AgentRuntime, dead code |

**Critério:** `loop.ts` <500 LOC; Deno ≥200.

---

### Fase 3 — Frontend decomposição · ~100h (após 2)

| # | Entrega |
|---|---------|
| 3.1 | Decompor `useAgentRun` |
| 3.2 | Materialização única |
| 3.3 | E2E verde |
| 3.4 | Remover sessionStorage |

---

### Fases 4–5 — Inalteradas

Confiabilidade produção (≥90% smoke) → Excelência (≥95%, 30 dias).

---

## 5. Plano de execução S.1–S.6 (20 passos)

Execução contínua até gate §1 verde. Cada passo = PR pequeno + verificação browser.

| Passo | Ação | Arquivos principais |
|-------|------|---------------------|
| 1 | Deletar `invoke` em `PromptEngine`; `markPendingAgentRun` | `PromptEngine.tsx`, `agent-auto-run.ts` |
| 2 | Coordinator: `peekPending` → `beginPendingTurn` → `runAgent(plan)` | `useAgentSessionCoordinator.ts` |
| 3 | Reconcile: retry 5s + realtime `agent_runs` INSERT | `useAgentRunReconcile.ts` |
| 4 | `ForgeThinking` em `AssistantTurn` (topo DOM) | `AssistantTurn.tsx` |
| 5 | `mapAssistantTurn` + `resolveTurnThinking` | `turn.ts`, `turn-display.ts` |
| 6 | Reverter teste "sem thinking" | `invariants.test.ts` |
| 7 | `isAssistantRunMaterialized`: rejeitar `checkpoint` | `assistant-materialized.ts` |
| 8 | `useChat`: não clear frozen em checkpoint | `useChat.ts` |
| 9 | `tool_done` no builder; merge builders | `forge-run.ts`, `timeline-builder.ts` |
| 10 | `resolveInspectorRunProgress`: `pickRicherProgress` | `assistant-run-progress.ts` |
| 11 | Remover `finish` do loop (tool-miss) | `loop.ts:1095` |
| 12 | Loop não chama `markRunStatus` | `loop.ts` |
| 13 | Plan resume → `runPlanModeAgentTurn` | `loop.ts:669-860` |
| 14 | `chunk_resume.maxAttempts = 12` | `run-executor.ts:457` |
| 15 | Opening obrigatório plan/build; `phase: gather` | `loop.ts` |
| 16 | LLM fail → mensagem PT, não `""` completed | `conversational.ts`, `loop.ts` |
| 17 | Deletar `TOOL_NUDGE` push vazio | `tool-progress.ts`, `loop.ts` |
| 18 | Deletar `statusChips`, `phaseMessage`, dead branches | `turn.ts`, `types.ts` |
| 19 | Smoke: exige `completed` ou `chunk_resume` cycle | `smoke-agent-e2e.mjs` |
| 20 | Gate browser checklist §1 em staging | manual + `agent-turn-flow` |

---

## 6. CI/CD — definição de "pronto" (revisada)

```yaml
# Bloqueante em PR agent/*
- npm run test -- agent-turn-flow lovable-acceptance chat-reliability
- deno test supabase/functions/agent-run/runtime/emitter.test.ts
- deno test supabase/functions/agent-run/loop.test.ts
- npm run check:agent-contract

# Bloqueante staging deploy (Fase S.5)
- node scripts/smoke-agent-e2e.mjs  # terminal honesto
- node scripts/check-stale-runs.mjs   # usa shouldSkipStaleExpiry
- node scripts/check-agent-run-metrics.mjs  # blocking em staging

# Informativo até Fase 1.5
- node scripts/check-shadow-parity.mjs  # blocking quando AGENT_RUNTIME_V2=shadow
```

**Regra:** merge em `agent/*` exige **um** verificador humano com checklist browser §1.

---

## 7. Métricas (revisadas)

| Métrica | Hoje | Meta Fase S | Meta Final |
|---------|------|-------------|------------|
| Jornada browser §1 | ❌ 0/6 | 6/6 | 6/6 |
| Failed rate 7d | ~53% | <30% | <5% |
| Dashboard→editor sem reenvio | ❌ | 100% | 100% |
| Inspector congela mid-run | frequente | 0 | 0 |
| Double finish | sim | 0 | 0 |
| Writers de status | 4 | 1 | 1 |
| `loop.ts` LOC | 3069 | 3000 | <500 |
| Gates que mentem | 5+ | 0 | 0 |

---

## 8. Governança

- **Fase S bloqueia** qualquer refactor estrutural (2.2+, 3.1, 1.5) até gate §1 verde.
- **PR de delete** — obrigatório na mesma entrega que liga o caminho novo.
- **ADR** para mudança de evento ou transição de status.
- **Auditoria** — atualizar `2026-06-22-journey-contract-audit.md` ao fechar cada S.n.

---

## 9. Próxima ação imediata

**Executar passos 1–6 (S.1 + S.2)** — dispatch único + Thought no chat.

Ordem: 1 → 2 → 3 (dispatch) → 4 → 5 → 6 (UX) → verificar browser → 7–20 sem parar.

---

## Apêndices (inalterados em essência)

- **ADR-001:** `agent_jobs` vs loops Inngest — válido; implementar após Fase S.
- **Mapa arquivos → alvo:** `loop.ts` → `runtime/phases/*`; `useAgentRun` → hooks — após S.

---

*Documento vivo. Última auditoria: 2026-06-22. Próxima revisão: ao fechar Fase S.*