# Agent Platform — Master Engineering Plan

> **Status:** Fase S ~85% · **bloqueador restante:** gate browser §1 (passo 20)  
> **Data:** 2026-06-21 (plano) · 2026-06-22 (auditoria) · 2026-06-22 (revisão S.3–S.5)  
> **Horizonte:** Contrato de Jornada verde → depois control plane 1.5  
> **Métrica norte:** Usuário completa turno no browser (dashboard→editor→plan→2º turno) sem intervenção

**Auditoria detalhada:** [`docs/superpowers/plans/2026-06-22-journey-contract-audit.md`](superpowers/plans/2026-06-22-journey-contract-audit.md)

---

## 0. Verdade pós-implementação (2026-06-22, revisado)

### Gates — estado real

| Gate | Passa? | Notas |
|------|--------|-------|
| Vitest `test:agent-journey` | ✅ | agent-turn-flow, lovable, invariants, inspector, forge-run, assistant-run-progress |
| Deno `runtime/` + conversational | ✅ | 122+ testes (loop.test.ts separado, precisa `--allow-env`) |
| `test:smoke-terminal` | ✅ | Rejeita `running` sem terminal; exige progresso rico em `completed` |
| `smoke-agent-e2e` | ✅ código | Terminal honesto via `smoke-terminal.mjs`; CI `agent-platform` job |
| `check:stale-runs` | ✅ | `shouldSkipStaleExpiry` + cleanup no deploy/CI |
| `check:agent-metrics` | ✅ CI | Blocking no job `agent-platform` e `check:deploy-gates` |
| `check:shadow-parity` | ⚠️ | Exit 0 se `AGENT_RUNTIME_V2` off |
| Browser §1 checklist | ❌ | Único bloqueador restante da Fase S |

### Sintomas — o que mudou

| Sintoma (auditoria) | Status | Evidência |
|---------------------|--------|-----------|
| Dashboard → editor, LLM morto | ✅ | `PromptEngine` usa `markPendingAgentRun`; coordinator `connect` |
| Sem "Pensando…" no chat | ✅ | `ForgeThinking` em `AssistantTurn`; `resolveTurnThinking` |
| Card parado / `phase: ""` | ✅ | `GATHER_PHASE_MESSAGE`, explore, opening fallback |
| Sem abertura antes do card | ✅ | `ensureOpeningBeforeWork` plan/build |
| 2º turno / timeline morre | ✅ | `assistant-materialized.ts` rejeita checkpoint; restore DB-only |
| Timeline só web research | ✅ | `tool_done` em `buildForgeTimeline`; inspector via `buildTimeline` |
| LLM fail retorna `""` | ✅ | Fallbacks PT em `conversational.ts` + `gate-replies.ts` |

### Estado real das fases

| Fase | % real | Notas |
|------|--------|-------|
| **0** Parar hemorragia | **~85%** | Smoke + metrics + stale no CI/deploy |
| **1** Control plane | ~35% | Shadow ok; executor real pausado |
| **2** Runtime decomposto | **✅ 100%** | `loop.ts` 443 LOC; `runtime/phases/*` |
| **3** Frontend | **~85%** | 3.1–3.2–3.4 ✅; 3.3 smoke no CI |
| **S** Contrato Jornada | **~85%** | S.1–S.5 ✅ código; S.6 parcial; §1 browser pendente |

### Decisão estratégica (vigente)

1. **Fases 2 + 3.1–3.2 + 3.4 + S.1–S.5 concluídas em código.**  
2. **Fechar Fase S** = checklist browser §1 verde em staging (passo 20).  
3. **PAUSAR** `agent_jobs` executor real (shadow continua).  
4. **Depois de S verde:** Fase 1.5 → Fases 4–5.

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

### Invariantes técnicas

1. **Um dispatch** — `sendMessage` / `connect`; zero `invoke` paralelo no agent path.
2. **Um stream live** — `agent_stream_events` + reducer durante run.
3. **Checkpoint ≠ terminal** — `meta.checkpoint` / `betweenChunks` não libera slot.
4. **Um finish** — um evento `finish` por run (executor único; loop emite `done`).
5. **Um status writer** — `transitionRun` no executor/Inngest.
6. **Um timeline builder** — `buildTimeline` → `buildForgeTimeline`.
7. **Deletar, não esconder** — proibido `""` como fallback user-facing.

### Gate de fechamento Fase S (browser + CI)

- [ ] Dashboard prompt → editor: pensando <2s, run conecta sem reenviar
- [ ] Plan mode 1º turno: thought → abertura → card → fechamento
- [ ] 2º turno: mesma jornada
- [ ] F5 mid-run: timeline = stream catch-up
- [ ] Inspector não congela após web_research
- [x] `agent-turn-flow` + smoke terminal verdes (CI)

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

## 3. Arquitetura alvo (v2)

```
UI: useAgentSession · useAgentStream · reducer · AssistantTurn (Thought→…→closing)
     ↓ POST agent-run (thin edge, preferences obrigatórias)
Control: agent_runs · agent_jobs (shadow) · agent_stream_events · pending_messages
     ↓ 1 chunk / 1 Inngest event (Fase 1.5 — após S)
Execution: AgentRuntime.runChunk() (Fase 2 — ✅)
```

### Demolição — status

| Componente | Status | Substituto |
|------------|--------|------------|
| `PromptEngine` invoke paralelo | ✅ removido | `markPendingAgentRun` + coordinator |
| `buildTimeline` duplicado | ✅ unificado | delega a `buildForgeTimeline` |
| `agent-job-stream` tree UI | ✅ removido | `execution-log-timeline.ts` (só reidratação) |
| `statusChips`, `phaseMessage` | ✅ removido | — |
| `TOOL_NUDGE=""` | ✅ removido | `decideToolProgress` |
| `loop.markRunStatus` | ✅ removido | `transitionRun` no executor |
| `forge:agent-snapshot` | ✅ removido | `agent-run-restore.ts` DB-only |
| `runningLocks` edge | ✅ removido | DB lock |
| `loop.ts` monólito | ✅ | `runtime/phases/*` |

---

## 4. Roadmap revisado

### Fase S — Contrato de Jornada · ~85% concluída

| # | Status | Entrega |
|---|--------|---------|
| S.1 | ✅ | Dispatch único dashboard → editor |
| S.2 | ✅ | Thought no chat (`ForgeThinking`) |
| S.3 | ✅ | Runtime fala: gather, opening, fallbacks PT |
| S.4 | ✅ | Inspector vivo: checkpoint gate, `tool_done`, builder único |
| S.5 | ✅ | Gates: smoke-terminal, stale, metrics no CI/deploy |
| S.6 | ⚠️ parcial | `agent-job-stream` → `execution-log-timeline`; P2 dead code pendente |

**Critério de saída:** Gate §1 completo no browser staging.

---

### Fase 0 — Parar hemorragia · ~85%

| # | Status | Entrega |
|---|--------|---------|
| 0.1 | ✅ | Plan mode `resumable` |
| 0.2 | ✅ | Inngest re-dispatch |
| 0.3 | ✅ | Stale-aware + gate CI |
| 0.4 | ✅ | Smoke blocking (CI + deploy) |
| 0.5 | ✅ | Deploy script metrics blocking |

---

### Fases 1–5 — inalteradas em visão

Control plane 1.5 após S verde → produção ≥90% → excelência ≥95%.

---

## 5. Plano de execução S.1–S.6 (20 passos)

| Passo | Status | Ação |
|-------|--------|------|
| 1–3 | ✅ | Dispatch único dashboard |
| 4–6 | ✅ | Thought no chat |
| 7–8 | ✅ | Materialização checkpoint |
| 9–10 | ✅ | `tool_done` + `pickRicherProgress` |
| 11–14 | ✅ | Sem double finish; plan resume; `maxAttempts: 12` |
| 15–17 | ✅ | Gather, opening, fallbacks PT, sem TOOL_NUDGE |
| 18 | ✅ | `statusChips`/`phaseMessage` removidos |
| 19 | ✅ | Smoke terminal honesto + `test:smoke-terminal` |
| 20 | ❌ | **Checklist browser §1 em staging** |

---

## 6. CI/CD — definição de "pronto"

```yaml
# Job quality (todo PR)
- npm run test:agent-journey
- deno test runtime/ + conversational.test.ts
- npm run check:agent-contract

# Job agent-platform (secrets required)
- npm run test:smoke-terminal
- npm run smoke:agent
- npm run check:agent-metrics
- node scripts/check-stale-runs.mjs --cleanup

# Deploy staging (deploy-agent-platform.sh)
- check:agent-gates + check:agent-metrics + check:shadow-parity
```

**Regra:** merge em `agent/*` exige verificador humano com checklist browser §1.

---

## 7. Métricas

| Métrica | Hoje | Meta Fase S |
|---------|------|-------------|
| Jornada browser §1 | ❌ 0/6 | 6/6 |
| Gates CI honestos | ✅ | ✅ |
| `loop.ts` LOC | **443** ✅ | <500 |
| `useAgentRun.ts` LOC | **286** ✅ | <300 |
| Double finish | 0 | 0 |
| Deno runtime tests | 122+ | mantido |

---

## 8. Governança

- **Fase S bloqueia** refactor estrutural até gate §1 verde.
- **PR de delete** — obrigatório na mesma entrega que liga caminho novo.
- **ADR** para mudança de evento ou transição de status.

---

## 9. Próxima ação imediata

**Passo 20 — validação browser em staging:**

1. `npm run check:agent-browser` (lovable-visual + dashboard→editor)
2. Plan mode 1º e 2º turno manual
3. F5 mid-run + inspector após `web_search`
4. Marcar §1 completo → fechar Fase S → iniciar Fase 1.5

Comandos locais pré-browser:

```bash
npm run test:smoke-terminal
npm run test:agent-journey
deno test --allow-env --no-check supabase/functions/agent-run/runtime/
```

---

*Documento vivo. Última revisão: 2026-06-22 (pós S.3–S.5). Próxima: ao fechar gate §1.*