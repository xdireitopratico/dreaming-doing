# Execution Sanity — Limpeza de arquitetura do agent-run

> **Status:** proposta para aprovação **antes de qualquer código**.  
> **Bloqueia:** `2026-07-02-turn-synchronizer-plan.md` (PR-D e seguintes) até Fase C verde.  
> **Princípio:** apagar complexidade; não empilhar camadas.

---

## 0. Contrato de produto (não negociável)

### O que é uma operação

1. Usuário envia **uma mensagem**.
2. A plataforma deriva **objetivo / critério / tarefa** (quando aplicável).
3. O agente **executa** (tools, sandbox, build) **dentro dessa mesma operação**.
4. O LLM emite **fechamento** (`final: true`).
5. Controle volta ao usuário.

**Fim.** Não há “turno 2 automático”, “chunk 3”, “retomada em background”.

### O que pode ser automático (só infraestrutura invisível + UX honesta)

| Situação | Comportamento permitido |
|----------|-------------------------|
| 429 / rate limit LLM | Retry com backoff; usuário vê “tentando de novo…” |
| Erro de conexão | Retry; usuário vê “reconectando…” |
| Modelo lento | Heartbeat (“ainda processando…”) |
| Checkpoint interno | Persistir estado **sem** simular fim da operação |
| Compactação de contexto | Invisível ou uma linha (“organizando contexto…”) |

### O que é proibido

| Proibido | Por quê |
|----------|---------|
| Auto-resume entre chunks | Usuário não pediu nova mensagem |
| `shadowEnqueueNextChunk` / fila `agent_jobs` disparando sozinha | Operação fantasma |
| `chunk_resume` como “já volto” | Parece que terminou e recomeçou |
| `timeout_warning` / “janela concluída — progresso salvo” | Parece falha + auto-continuação |
| `resumable: true` + status `running` sem ação do usuário | Contrato mentiroso |
| Validar build completo a cada arquivo de config | Gera falha terminal falsa |

### Se a plataforma impor teto duro (ex. ~14 min por invocação Inngest)

- A operação **não** se divide sozinha.
- Opções honestas (escolher uma na Fase B):
  - **A)** Usar o teto real inteiro numa única invocação (apagar corte 270s).
  - **B)** Parar com `awaiting_user` + botão **Continuar** (ação explícita do usuário).
- **Nunca** C) re-enfileirar job automaticamente.

---

## 1. Diagnóstico em uma frase

O projeto construiu **cinco relógios**, **dois sistemas de continuação**, e **validação pós-write** — e tratou isso como produto. O usuário vê parada, restart e lixo no inspector; o LLM recebe parede de `BUILD FALHOU`; o Turn Synchronizer assume um loop que hoje está doente.

---

# FASE A — APAGAR (demolição agressiva)

> Regra: cada item abaixo sai no mesmo PR que remove callsites e testes que dependem dele. Sem “deprecated por enquanto”.

## A1. Relógios artificiais (tudo relacionado a `loopBudgetMs`)

| Apagar | Arquivos / símbolos |
|--------|---------------------|
| `loopBudgetMs`, `LOOP_BUDGET_MS`, `AGENT_LOOP_BUDGET_MS`, `INNGEST_LOOP_BUDGET_MS` | `runtime/loop-config.ts`, `loop.ts`, `run-job.ts`, `run-agent-loop.ts`, `deps-factory.ts` |
| `loopBudgetExceeded()` e todos os `if (loopBudgetExceeded()) return …` | `execute.ts`, `plan-turn.ts`, `orchestrator.ts`, `design-preflight-phase.ts`, `observer.ts` (checks de budget) |
| `runStartTime` como base de corte por chunk | `loop.ts` — não reiniciar relógio a cada invocação |
| `timeout_warning` evento + alerta | `persist.ts`, `runtime/emitter.ts`, `agent-progress.ts` |
| Mensagem “Janela de execução concluída — progresso salvo para continuar” | `persist.ts` |
| `readLoopBudgetMsFromRuntime`, `resolveLoopBudgetMs` | `loop-config.ts` — arquivo pode ser reduzido ou removido |
| Testes que mockam `loopBudgetExceeded` como comportamento esperado | `execute.test.ts`, `closure-paths.test.ts`, `infra.test.ts`, etc. |

## A2. Auto-chunk / auto-resume (tudo que continua sem mensagem do usuário)

| Apagar | Arquivos / símbolos |
|--------|---------------------|
| `returnResumableChunk` | `runtime/infra.ts` |
| `returnResumableWithUserMessage` como caminho de **saída de budget/step** | `infra.ts` — manter **só** para erros LLM com `pauseForUser` (429/conexão) se ainda necessário |
| Todos os `return deps.returnResumableWithUserMessage(...)` em `execute.ts` por budget/maxSteps | `execute.ts` — maxSteps vira limite de sanidade extrema ou sai; não gera chunk |
| `shadowEnqueueNextChunk`, `shadowCompleteJob` (handoff) | `run-executor.ts`, `_shared/agent-jobs.ts` |
| `evaluateChunkLimits`, `MAX_CHUNK_GENERATIONS`, `MAX_RUN_WALL_MS`, `CHUNK_HANDOFF_GAP_MS` | `_shared/agent-chunk-limits.ts` — arquivo inteiro |
| `chunkCapErrorMessage`, `chunkCap`, `resumableExhausted`, `resumeAttempts` no contrato | `agent-contract`, `_events.ts`, `agent-progress.ts` |
| `runAgentLoopWithResume` loop `for (i < maxSteps)` | `inngest/functions/_shared.ts` — uma execução por evento Inngest |
| `maxLoopResumeStepsForRuntime()` (1 vs 3) | `inngest/functions/agent-jobs.ts` |
| `chunk_resume` evento SSE | `_events.ts`, `agent-progress.ts`, testes |
| `betweenChunks`, `autoResuming` no front | `persist.ts` meta, `agent-progress.ts`, `AssistantTurn.tsx`, handlers |
| `delivery_checkpoint` como “entrega parcial + continuo sozinho” | `infra.ts` `emitDeliveryCheckpoint`, stream — checkpoint vira **interno**, não evento de produto |
| `persistCheckpointChat` materializando “entre chunks” no DB | `persist.ts` — reescrever ou apagar; não criar mensagem assistant fake de handoff |
| `CHUNK_HANDOFF_EVENT_TYPES` na pending queue | `_shared/agent-pending-queue.ts` |
| `waitForQueuedAgentJob` polling | `agent-jobs.ts` |
| Documentação que celebra “12 chunks / maxAttempts” como feature | `AGENT_PLATFORM_MASTER_PLAN.md` (trechos), `AGENT_RUN_STABILIZATION.md` (atualizar depois) |

## A3. Validação e gates como tortura (backend)

| Apagar | Arquivos / símbolos |
|--------|---------------------|
| `observe()` **obrigatório** após cada batch com `fs_write`/`fs_edit` | `execute.ts` ~1128 |
| `emit("gate", …)` no SSE | `observer.ts` `pushGate` → só `checks.push` interno |
| `emit("validate_fail")` / `emit("validate_ok")` no stream intermediário | `execute.ts` — falha de build vira feedback interno ao LLM, não evento inspector |
| `emit("preview_sync")` | `execute.ts`, `tools/fs.ts` — preview sync continua; evento some |
| Injeção `BUILD FALHOU:\n{até 2000 chars}` repetida | `execute.ts` — substituir na Fase B por feedback curto |
| Segunda passagem `finalObservation = observe()` com gates completos em todo run | `execute.ts` ~1230 — só na Fase B “marco final” |
| `pushGate` para design-uniqueness em todo observe | `observer.ts` — uniqueness vira log ou sai |

## A4. Reentrada / falso “começar de novo”

| Apagar | Arquivos / símbolos |
|--------|---------------------|
| `resumeRun` fast path frágil que ainda cai em preflight | `orchestrator.ts` — simplificar: uma operação não “resume” sozinha |
| `directive` emitido em `loopStep === 1` em continuação | `execute.ts` — directive **uma vez por mensagem do usuário** |
| `buildSession = createCanonicalBuildSession` cego a cada invocação | `loop.ts` — sessão vive a operação inteira |
| Checkpoint que não inclui `touchedPaths` | `checkpoint.ts` — ou apaga checkpoint antigo e substitui na Fase B |
| `explore` emitido no handoff de chunk | `infra.ts` `returnResumableChunk` |

## A5. Eventos e inspector — lixo na origem (não “higienizar mini-card”)

Mini-card **não** é o problema; o backend **emite demais**. Apagar da superfície do stream:

| Evento | Ação |
|--------|------|
| `gate` | Remover do contrato público |
| `preview_sync` | Remover do contrato público |
| `validate_fail` / `validate_ok` | Remover do stream; manter resultado humano único se necessário |
| `timeout_warning` | Remover |
| `chunk_resume` | Remover |
| `delivery_checkpoint` (como hoje) | Remover ou tornar strictly internal |
| `fsm_transition` | Já interno; garantir que não vaza |
| Fases `execute` / `observe` / `preflight` como TASK fallback | `timeline-builder` fallback com `ev.type` — corrigir na Fase B contrato, não filtro infinito |

## A6. Testes e mocks que legitimam o modelo errado

| Apagar / reescrever |
|---------------------|
| `closure-paths.test.ts` casos `budget_exceeded`, `max_steps_resumable` como resumable chunk |
| `loop.test.ts` cenários “resume checkpoint” com auto-continuação |
| `agent-progress.test.ts` `chunk_resume`, `delivery_checkpoint` silencioso |
| `execute.test.ts` “resumable com prose” como sucesso de handoff |
| `_shared.test.ts` `maxLoopResumeStepsForRuntime` |

### Contagem honesta

- **~15–20 arquivos** tocados na demolição.
- **~2–4 arquivos** possivelmente removidos por completo (`agent-chunk-limits.ts`, partes de `agent-jobs.ts`).
- Linhas líquidas esperadas: **milhares removidas**, centenas adicionadas na Fase B.

---

# FASE B — CONSTRUIR (mínimo indispensável)

> Só entra aqui o que **sem ele a operação quebra** depois da Fase A.

## B1. Modelo único: `UserOperation`

Uma mensagem do usuário = um `operation_id` / `run_id` com estados:

```
accepted → running → (retrying_llm?) → closing → completed | failed | awaiting_user
```

- `retrying_llm`: 429/conexão — **mesma operação**, UX visível.
- `awaiting_user`: só quando produto exige ação (clarify, plan approve, ou **Continuar** explícito se teto Inngest estourar).
- **Não existe** `between_chunks`, `resumable` silencioso.

## B2. `OperationRunner` (substitui pilha chunk+budget)

| Responsabilidade | Detalhe |
|------------------|---------|
| Loop único | `execute.ts` work loop sem saída por relógio 270s |
| Teto real | Uma constante: limite da invocação Inngest (~14 min). Checagem cooperativa: “faltam 60s?” → preparar fechamento honesto ou `awaiting_user` |
| Checkpoint interno | Grava estado em disco/DB **sem** emitir fim; para recovery se processo morrer — **não** dispara novo job |
| LLM retry | Já existe em `llm-retry.ts` / `robin-pool` — consolidar como único “auto” permitido |

## B3. `ValidationPolicy` (substitui observe-a-cada-write)

| Modo | Quando |
|------|--------|
| `off` | Só configs (`package.json`, `vite.config`, `tsconfig`) sem `src/` |
| `light` | Existe `src/` mas operação ainda em scaffolding — `tsc` rápido |
| `full` | Marco final da operação ou antes de `final: true` |

Uma linha no inspector no máximo: “Conferindo build…” → “Build OK” ou “Corrigindo erros…”.

## B4. Feedback LLM enxuto (substitui BUILD FALHOU dump)

Formato fixo, curto:

```
[typecheck] src/App.tsx:42 — Property 'x' does not exist. Use fs_edit.
```

Sem repetir install, design-fidelity, uniqueness.

## B5. Contrato de stream fechado

Lista **allowlist** do que pode ir para inspector / timeline:

- `thinking_text`, `assistant_text` (opening/final)
- `tool_start`, `tool_done`
- `file_diff`
- `design` (directive 1× por operação)
- `task` / `declare_tasks` (futuro Turn Sync)
- `alert` (rate limit, connection retry — só operação ativa)
- `context_usage` (indicador separado)
- `finish` / `done` terminal

Tudo else: log estruturado (`logger.event`), não SSE.

## B6. Inngest simplificado

| Antes | Depois |
|-------|--------|
| `agent-build` → `runAgentLoopWithResume` 3× → `shadowEnqueue` | `agent-build` → **um** `runAgentLoop` até terminal |
| `agent_jobs` fila de gerações | Removida ou reduzida a lease técnico sem handoff automático |

---

# FASE C — ENTREGAR (definição de pronto)

## C1. Critérios de produto (seu teste LiveKit)

- [ ] Uma mensagem “monta landing livekit…” → operação corre **sem** parada aos 270s.
- [ ] **Zero** alertas “janela de execução concluída”.
- [ ] **Zero** strings `gate`, `preview_sync`, `validate_fail` no inspector.
- [ ] Após 3 arquivos de config, **não** dispara build completo nem parede de erro no LLM.
- [ ] Se 429, usuário vê retry — operação **não** “termina” e **não** recomeça sozinha depois.
- [ ] Fechamento LLM (`final: true`) ou falha honesta — uma vez por mensagem.
- [ ] Context Window no chat **independente** de “execução concluída”.

## C2. Gates técnicos

```bash
npm run test:agent-run
npm run test:agent-journey
npm run test:smoke-terminal
```

Novos testes obrigatórios:

- `operation-no-artificial-budget.test.ts` — loop não retorna resumable por tempo
- `operation-scaffold-no-validate-stream.test.ts` — 3 configs sem validate no SSE
- `stream-allowlist.test.ts` — eventos proibidos não estão no contrato

## C3. Deploy

- `agent-run` + bundle Inngest no mesmo PR da Fase A/B consolidada.
- Sem deploy parcial que deixe chunk antigo no ar.

## C4. Documentação atualizada

- `AGENT_RUN_STABILIZATION.md` — regras de chunk **removidas**, contrato `UserOperation`.
- `2026-07-02-turn-synchronizer-plan.md` — banner “bloqueado até execution-sanity Fase C”.

---

## 2. Ordem de PRs (demolição primeiro)

| PR | Conteúdo | Fase |
|----|----------|------|
| **ES-1** | Apagar `loopBudgetMs` + `timeout_warning` + exits por budget | A1 |
| **ES-2** | Apagar auto-chunk: `agent-chunk-limits`, `shadowEnqueue`, `runAgentLoopWithResume`, `chunk_resume` | A2 |
| **ES-3** | Apagar `returnResumable*` de execute/plan/orchestrator (exceto LLM pause) | A2 |
| **ES-4** | Apagar observe pós-write + `gate`/`validate_fail`/`preview_sync` SSE | A3 |
| **ES-5** | Apagar eventos mortos do contrato + testes legados | A5–A6 |
| **ES-6** | `OperationRunner` + `ValidationPolicy` + stream allowlist | B |
| **ES-7** | Gates C + staging manual | C |

Cada PR: verde nos testes **antes** de merge. ES-1 a ES-5 podem ser um stack se preferir velocidade; preferível **um PR grande de demolição** + **um PR de construção mínima** para evitar estado intermediário quebrado.

---

## 3. Relação com Turn Synchronizer

| Item Turn Sync | Status até Fase C |
|----------------|-------------------|
| PR-A TurnGuide (merged) | Mantém |
| PR-B ActionLedger (merged) | Mantém |
| PR-C opening/closing (merged) | Mantém — assume loop consertado |
| PR-D declare_tasks | **Bloqueado** |
| TurnGuide gates duros | Mantém — mas sem observe pós-write |

Turn Sync constrói **em cima** de `UserOperation`. Sem limpeza, declare_tasks vira mais ruído na timeline.

---

## 4. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Run > 14 min Inngest morre | Teto honesto + `awaiting_user` “Continuar” (ação do usuário) — **não** auto-chunk |
| Regressão em plan/chat mode | Mesma demolição de resumable; testes dedicados |
| Testes verdes, produção ruim | Seu teste manual LiveKit em staging obrigatório na Fase C |
| Apagar demais | Fase B é mínima; checkpoint interno só para crash recovery |

---

## 5. O que NÃO fazer neste plano

- Refatorar `loop.ts` inteiro para outro framework.
- Novo FSM paralelo.
- “Higienizar” só `timeline-builder` sem apagar emissões no backend.
- Adicionar `declare_tasks`, novo chunk system, ou mais caps de tempo.
- Auto-resume “temporário” — atalho que vira permanente.

---

## 6. Aprovação

- [ ] Produto: contrato `UserOperation` (seção 0) aprovado
- [ ] Demolição A1–A6 aprovada (agressiva)
- [ ] Fase B mínima aprovada
- [ ] Critérios C aprovados

**Só após todos os checks:** iniciar ES-1.

---

*Documento vivo. Última revisão: 2026-07-02. Autor: reavaliação execution-sanity pós-teste LiveKit.*