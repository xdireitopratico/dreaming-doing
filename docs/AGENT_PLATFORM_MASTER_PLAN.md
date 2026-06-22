# Agent Platform — Master Engineering Plan

> **Status:** Aprovado para execução (liderança técnica)  
> **Data:** 2026-06-21  
> **Horizonte:** 12 meses · produção impecável ao final  
> **Métrica norte:** ≥95% de runs `completed` em builds típicos (projeto vite-react, plano aprovado, BYOK configurado)

---

## 1. Verdade operacional (não negociável)

Os testes unitários passam. **Produção falha ~53% das runs** (29 failed / 26 completed na última semana).

Isso não é bug pontual — é **falha de arquitetura**:

| Sintoma em produção | Causa raiz |
|---------------------|------------|
| "continua em segundo plano" + `failed` | Chunk resumable tratado como falha terminal no Inngest |
| Plan mode morre no budget | `runPlanModeAgentTurn` descarta `resumable: true` |
| 9× "zumbi" | Stale detector não entende `betweenChunks` / `observe()` longo |
| Chat sem assistant | Materialização terminal inconsistente (3 writers) |
| Contrato drift | 7 arquivos espelhados frontend↔backend, sync manual |
| `loop.ts` 3195 linhas | Impossível evoluir sem regressão |

**Decisão estratégica:** não mais band-aids no `loop.ts`. Reconstruir a **fundação de orquestração** mantendo o que funciona (stream events, Realtime, E2B, providers).

---

## 2. Princípios de engenharia (constituição do projeto)

1. **Uma fonte de verdade por conceito** — status, eventos, checkpoint, fila.
2. **Estado explícito > flags implícitas** — `betweenChunks` no meta JSONB é dívida; vira coluna ou job state.
3. **Mentira zero na UX** — se o sistema pausa, `awaiting_user` ou `running`; nunca `failed` com mensagem otimista.
4. **Um writer por transição** — quem muda `agent_runs.status` é sempre o mesmo módulo.
5. **Teste que importa** — smoke E2E real (Supabase + Inngest + opcional E2B) bloqueia merge.
6. **Arquivos <800 linhas** — acima disso, decomposição obrigatória no PR.
7. **Demolição controlada** — código legado atrás de `AGENT_RUNTIME_V2` flag até paridade comprovada.

---

## 3. Arquitetura alvo (v2)

### 3.1 Visão

```
┌─────────────────────────────────────────────────────────────────┐
│  UI Layer (React)                                               │
│  useAgentSession · useAgentStream · AgentProgress reducer       │
│  Contrato: agent-event-contract (único pacote compartilhado)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ POST agent-run (thin edge)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Control Plane (Edge + Postgres)                                │
│  agent_runs (sessão visível)                                    │
│  agent_jobs (fila de trabalho — NOVO)                          │
│  agent_stream_events (telemetria ordenada)                      │
│  agent_pending_messages (intents do usuário)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ lease job
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Execution Plane (Inngest / Vercel)                             │
│  agent-job-worker: 1 chunk → resultado → re-enqueue OU terminal │
│  AgentRuntime (loop decomposto, sem side-effects de status)     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Infrastructure                                                 │
│  E2B Sandbox · LLM Providers · forge-ui preflight               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Tabela nova: `agent_jobs`

Cada **chunk de execução** é um job explícito — acaba a ambiguidade do Inngest fazendo 3 loops internos.

```sql
agent_jobs (
  id            uuid PK,
  run_id        uuid FK → agent_runs,
  generation    int,           -- 1..N chunk
  status        text,          -- queued | leased | completed | failed | canceled
  lease_until   timestamptz,   -- worker heartbeat
  payload       jsonb,         -- resume checkpoint ref, planMode, etc.
  result        jsonb,         -- ok, resumable, error, steps
  created_at,
  finished_at
)
```

**Regra:** worker processa **um** job por invocação Inngest. Se `result.resumable`, insere `agent_jobs` generation+1 com `status=queued` e dispara novo evento. **Nunca** marca `agent_runs.failed` nesse caminho.

### 3.3 Máquina de estados única (`AgentRunLifecycle`)

Implementação: `packages/agent-contract/src/lifecycle.ts` (compartilhado Deno + Node via build).

```
                    ┌──────────┐
                    │ pending  │  ← planApprove / lock
                    └────┬─────┘
                         │ dispatch
                         ▼
                    ┌──────────┐
         ┌─────────│ running  │─────────┐
         │         └────┬─────┘         │
         │ chunk handoff│               │ cancel
         │ (jobs queue) │               ▼
         │              │         ┌──────────┐
         └──────────────┘         │ canceled │
                                  └──────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌────────────┐ ┌────────────┐ ┌──────────┐
    │ awaiting_  │ │ completed  │ │  failed  │
    │   user     │ │            │ │          │
    └────────────┘ └────────────┘ └──────────┘
```

Transições válidas são **exaustivas** e testadas. Qualquer código que escreva `status` passa por `transitionRun(runId, event)`.

### 3.4 Decomposição do monólito `loop.ts`

| Módulo novo | Responsabilidade | ~linhas |
|-------------|------------------|---------|
| `runtime/emitter.ts` | Stream events + validação contrato | 150 |
| `runtime/checkpoint.ts` | save/load/clear | 200 |
| `runtime/phases/gather.ts` | contexto + classify | 250 |
| `runtime/phases/plan.ts` | plan mode explore | 300 |
| `runtime/phases/build.ts` | execute loop + tools | 400 |
| `runtime/phases/observe.ts` | build gate + validation | 300 |
| `runtime/phases/conversational.ts` | clarify/advisory | 200 |
| `runtime/orchestrator.ts` | FSM + phase routing | 350 |
| `runtime/index.ts` | `AgentRuntime.runChunk()` API pública | 100 |

**`runChunk(budgetMs)`** retorna `{ outcome: 'continue' | 'awaiting_user' | 'completed' | 'failed', ... }` — **sem** escrever em `agent_runs` diretamente.

### 3.5 Pacote compartilhado `packages/agent-contract`

Elimina os 7 mirrors:

```
packages/agent-contract/
  src/
    events.ts          ← agent-event-contract (único)
    lifecycle.ts       ← FSM + transições
    errors.ts          ← llm-error-hints
    checkpoint-chat.ts
    plan-markdown.ts
    narration.ts
  package.json         ← build: deno bundle + esm for vite
```

Edge e Vite importam o **mesmo artefato buildado**. Drift = CI failure.

### 3.6 Frontend: decompor `useAgentRun.ts`

| Hook | Responsabilidade |
|------|------------------|
| `useAgentStream(runId)` | Realtime + catch-up + seq mutex |
| `useAgentProgress()` | Reducer puro (já existe em lib) |
| `useAgentSession()` | connect, cancel, queue, drain |
| `useAgentSnapshot()` | sessionStorage restore |

`useAgentRun` vira facade fina (~150 linhas) para compatibilidade.

### 3.7 Stale / zumbi (política v2)

| Condição | Ação |
|----------|------|
| `agent_jobs` leased + `lease_until` expirado | Re-queue job (não fail run) |
| `running` + job queue vazia + sem stream 15min | `failed` + `staleExpired` |
| `betweenChunks` (legado) / job `queued` | **Nunca** expirar |
| `observe()` >5min | Heartbeat via job lease renewal |

---

## 4. Roadmap — 12 meses

### Fase 0 — Parar a hemorragia (Semanas 1–2) · ~40h

**Objetivo:** produção deixa de mentir; chunk resume funciona até 12 gerações.

| # | Entrega | Impacto |
|---|---------|---------|
| 0.1 | Fix `resumable` em plan mode | Elimina failed silencioso em plan |
| 0.2 | Inngest re-dispatch: `resumable` → novo evento (não `failed`) | Corrige "continua em segundo plano" |
| 0.3 | Stale-aware: não expirar `betweenChunks` / `lastChunkAt` fresco | −9 zumbis/semana |
| 0.4 | Smoke E2E obrigatório no CI (staging) | Testes deixam de ser papel higiênico |
| 0.5 | Deploy checklist automatizado (edge + inngest + vercel) | PR #2 efetivo em prod |

**Critério de saída:** 7 dias staging com <15% failed em builds padrão.

### Fase 1 — Control Plane (Semanas 3–8) · ~120h

**Objetivo:** `agent_jobs` + lifecycle writer único.

| # | Entrega |
|---|---------|
| 1.1 | Migration `agent_jobs` + RLS |
| 1.2 | `packages/agent-contract` extraindo events + lifecycle |
| 1.3 | `transitionRun()` — único writer de `agent_runs.status` |
| 1.4 | Edge: criar job no dispatch (substitui loop interno Inngest) |
| 1.5 | Worker Inngest: 1 job/chunk + re-enqueue explícito |
| 1.6 | Feature flag `AGENT_RUNTIME_V2` — shadow mode (escreve jobs, executa v1) |

**Critério de saída:** paridade v1/v2 em 100 runs de regressão; 0 divergência de status terminal.

### Fase 2 — Runtime decomposto (Semanas 9–16) · ~160h

**Objetivo:** demolir `loop.ts`; `AgentRuntime.runChunk()`.

| # | Entrega |
|---|---------|
| 2.1 | Extrair `runtime/emitter` + testes contrato |
| 2.2 | Extrair phases (gather, plan, build, observe) |
| 2.3 | `orchestrator.ts` com FSM explícito |
| 2.4 | Migrar executor para `AgentRuntime` atrás da flag |
| 2.5 | Deletar código morto em `index.ts` (Fase 4.7, runningLocks) |

**Critério de saída:** `loop.ts` <500 linhas (shim) ou removido; Deno tests ≥200 pass.

### Fase 3 — Frontend & materialização (Semanas 17–22) · ~100h

**Objetivo:** chat sempre materializa; inspector = stream.

| # | Entrega |
|---|---------|
| 3.1 | Decompor `useAgentRun` |
| 3.2 | Materialização: um path (`onRunTerminal` event → message insert) |
| 3.3 | `agent-turn-flow` E2E verde |
| 3.4 | Remover sessionStorage snapshot (substituir por DB catch-up) |

**Critério de saída:** 0 threads só com `user` após run terminal; replay = stream.

### Fase 4 — Confiabilidade de produção (Semanas 23–30) · ~120h

**Objetivo:** builds reais passam; providers resilientes.

| # | Entrega |
|---|---------|
| 4.1 | `fs_read` sem truncamento silencioso + validação tamanho |
| 4.2 | Build gate: feedback estruturado (TS errors parseados) |
| 4.3 | Provider fallback chain (NIM 500 → Groq → ...) |
| 4.4 | Sandbox lifecycle unificado (`docs/SANDBOX_LIFECYCLE.md` → código) |
| 4.5 | Observabilidade: dashboard runs (status, P50 duração, top errors) |

**Critério de saída:** ≥90% completed em smoke suite de 20 cenários reais.

### Fase 5 — Excelência & escala (Semanas 31–52) · ~200h

**Objetivo:** produto impecável, equipe pode evoluir sem herói.

| # | Entrega |
|---|---------|
| 5.1 | Remover flag v1; delete `loop.ts` legado |
| 5.2 | Typecheck zero erros no CI |
| 5.3 | Playwright E2E: send → build → preview |
| 5.4 | Load test: 10 runs concorrentes, 0 duplicata |
| 5.5 | Runbook operacional + alertas (stuck jobs, failed rate >20%) |
| 5.6 | Documentação contrato público (OpenAPI edge + event catalog) |

**Critério de saída:** ≥95% completed · 30 dias · builds típicos · sem intervenção manual.

---

## 5. O que preservamos (não demolir)

| Componente | Por quê |
|------------|---------|
| `agent_stream_events` + seq | Funciona; Realtime sólido |
| `agent_pending_messages` | Fila de intents correta |
| `appendStreamEvent` | Boa abstração |
| Provider layer (`providers.ts`, `robin-pool.ts`) | Investimento alto |
| E2B integration | Core do produto |
| `vibe-coding-prompt.ts` | Diferencial; refinar, não apagar |
| Plan approval flow (`plan-decide`) | UX correta; só precisa dispatch v2 |
| Reducer `agent-progress.ts` | Bem testado após PR #2 |

---

## 6. O que demolimos

| Componente | Substituto |
|------------|------------|
| Loop interno 3× no Inngest | `agent_jobs` + re-dispatch |
| 7 arquivos mirror | `packages/agent-contract` |
| `runningLocks` Map (edge) | só RPC advisory lock |
| `finalizeRun` duplicado no edge | `transitionRun` |
| Meta `betweenChunks` como boolean | `agent_jobs.status` |
| `useAgentRun` monólito | 4 hooks focados |
| Código morto Fase 4.7 em `index.ts` | delete |

---

## 7. CI/CD — definição de "pronto"

```yaml
# Pipeline obrigatório (todo PR que toca agent/*)
- deno test supabase/functions/agent-run/
- npm run test -- --run
- npm run typecheck          # Fase 5: blocking
- npm run build:inngest
- node scripts/smoke-agent-e2e.mjs --env=staging  # Fase 0: blocking
- node scripts/check-stale-runs.mjs                  # 0 stuck após smoke
```

**Regra de merge:** smoke E2E verde + reviewer confirma lifecycle diagram atualizado se mudou transição.

---

## 8. Métricas de acompanhamento (semanal)

| Métrica | Hoje | Meta Fase 0 | Meta Final |
|---------|------|-------------|------------|
| Failed rate (7d) | 53% | <25% | <5% |
| Zumbis expirados | 9/sem | 0 | 0 |
| Runs "mentirosas" (failed + msg otimista) | 9/sem | 0 | 0 |
| Tempo médio completed (build) | ? | medir | <8 min P50 |
| Deno contract tests | 48 | 48 | ≥200 |
| Maior arquivo (linhas) | 3195 | 3195 | <800 |
| Mirrors manuais | 7 | 7 | 0 |

Query semanal: `docs/debug-runs.sql` + dashboard (Fase 4).

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Regressão durante migração | Feature flag v2 + shadow mode Fase 1 |
| Inngest custo (mais eventos) | 1 evento/chunk é barato vs run falha |
| Equipe perdida no monólito | ADRs em `docs/adr/` por fase |
| E2B instabilidade | Sandbox pool + retry; não misturar com lifecycle bug |
| Scope creep (design DNA, etc.) | Fora do escopo até Fase 5 gate |

---

## 10. Governança

- **ADR obrigatório** para toda mudança de transição de estado ou evento.
- **PR >400 linhas** em `agent-run/` exige decomposição ou justificativa escrita.
- **Produção:** deploy só com smoke verde; rollback = flag v1.
- **Revisão semanal:** métricas §8 + top 3 failed runs diagnosticadas.

---

## 11. Próxima ação imediata (Fase 0.1–0.3)

Implementação começa agora, nesta ordem:

1. `loop.ts` — propagar `resumable: true` no plan mode budget exit.
2. `agent-build.ts` + `agent-plan.ts` — chunk não exaurido → re-dispatch Inngest com `resume: true`.
3. `agent-pending-queue.ts` — `expireStaleRuns` respeita `betweenChunks`, `lastChunkAt`, jobs queued.
4. `scripts/smoke-agent-e2e.mjs` — integrar no CI como gate.
5. Deploy staging → validar 48h → produção.

---

## Apêndice A — ADR-001: Por que `agent_jobs` e não mais loops no Inngest

**Contexto:** `runAgentLoopWithResume` faz 3 `step.run` internos. Após 3 chunks resumable, marca `failed` com mensagem "continua em segundo plano". `MAX_CHUNK_GENERATIONS=12` nunca é atingido.

**Decisão:** Um evento Inngest = um chunk = um row em `agent_jobs`. Continuação = novo evento + novo job. Estado visível ao operador.

**Consequência:** Mais eventos Inngest (~3–8 por run longa), mas runs completam. Custo << retrabalho do usuário.

---

## Apêndice B — Mapa de arquivos atuais → alvo

```
supabase/functions/agent-run/loop.ts     → packages/agent-runtime/phases/*
supabase/functions/agent-run/index.ts    → edge/handlers/* (<300 linhas cada)
src/hooks/useAgentRun.ts                 → hooks/useAgent{Stream,Session,Snapshot}.ts
src/lib/agent-event-contract.ts          → packages/agent-contract/src/events.ts
src/inngest/functions/agent-build.ts     → inngest/agent-job-worker.ts
```

---

*Documento vivo. Atualizar ao fechar cada fase com evidência (métricas §8 + link PR).*