# Execution Sanity v2 — Plano qualificado (specs fechadas)

> **Status:** aguardando aprovação §12  
> **Substitui:** rascunho `execution-sanity-cleanup.md` (manter só como histórico)  
> **Bloqueia:** `2026-07-02-turn-synchronizer-plan.md` até §11 verde  
> **Versão:** 2026-07-03

---

## §1 — Problema (evidência)

O runtime atual acumula **quatro falhas de design** que produziram o incidente LiveKit:

| # | Falha | Evidência no código |
|---|-------|---------------------|
| P1 | Relógio artificial 270s interrompe loop ativo | `loopBudgetExceeded()` → `returnResumableWithUserMessage` em `execute.ts:475` |
| P2 | Auto-continuação sem usuário | `agent-build.ts:93-112` re-dispatch Inngest quando `resumable`; `returnResumableChunk` em `infra.ts:145` |
| P3 | Validação full após cada write | `observe()` em `execute.ts:1141` após todo batch com `fs_write`/`fs_edit` |
| P4 | Stream poluído com eventos de engenharia | `emit("gate")` em `observer.ts:158`; fallback `ev.type` em `timeline-builder.ts:483` |

O executor **já é só Inngest** para build/plan/chat (`index.ts:58-66` retorna 410 em `execute`). Edge é dispatcher fino. O problema não é “falta de Inngest” — é **regras erradas dentro do Inngest**.

---

## §2 — Contrato de produto (fechado)

### §2.1 — Operação

```
Usuário envia 1 mensagem
  → 1 agent_run (run_id estável)
  → 1 dispatch Inngest (evento agent/{build|plan|chat}.requested)
  → 1 invocação de loop até terminal
  → fechamento LLM (final) OU terminal honesto
```

- **Não existe** segunda operação automática na mesma mensagem.
- **Não existe** `chunk_generation++` silencioso.
- **Não existe** `resumable: true` com status `running` sem `awaiting_user`.

### §2.2 — Retrial: princípio (não lista fechada)

> **429 e conexão foram exemplos de contexto**, não inventário determinístico. A regra é classificar **por critério**, não por enum fixo de códigos HTTP.

#### Três camadas (única taxonomia do produto)

| Camada | Nome | Critério | Quem dispara | Novo Inngest? | UX |
|--------|------|----------|--------------|---------------|-----|
| **A** | In-band | Falha **transitória** na mesma chamada; **mesma config** pode resolver; **sem** mudança de estado da operação | Runtime (robin, adapter, tool) | **Não** | `alert` transitório ou silêncio |
| **B** | In-loop | Falha recuperável **dentro da mesma invocação**; estado já parcialmente avançou; retry é **idempotente ou compensável** | Loop (`execute.ts`, FSM, repair) | **Não** | Continua inspector; sem “parou” |
| **C** | Continuar | Limite de plataforma, esgotamento de budget de retry, ou decisão de produto que exige humano | **Usuário** clica Continuar | **Sim** (evento explícito) | `run_paused` + botão |

**Proibido (não é retrial):** auto-chunk, `sendEvent` Inngest, `shadowEnqueueNextChunk`, `resumable: true` + `running` — isso é **continuação fantasma**, camada ilegal entre B e C.

#### Classificador (implementar como `classifyRetrial`, não tabela hardcoded)

```
SE erro é auth/billing/model-not-found/provider-payload (shouldFailFastLlmError)
  → terminal failed (sem retry)

SE erro é transitório de transporte/provider capacity (isRetryableLlmError e afins)
  E tentativa < budget camada A
  → camada A (backoff, robin rotate)

SE falha é de contrato do loop (sem tools, timeout por step, build repair, gate-reply)
  E tentativa < budget camada B
  E operação ainda não atingiu fusível (maxSteps, build-fix cap)
  → camada B (loopStep--, forceTools, feedback curto ao LLM)

SE budget A+B esgotado OU platformDeadline OU step_limit
  → camada C (pauseOperationForUser, awaiting_user)

NUNCA: camada A/B dispara novo job Inngest
```

#### Exemplos (ilustrativos — o classificador decide, não a lista)

| Situação hoje no código | Camada | Nota |
|-------------------------|--------|------|
| 429 / 503 / 529 / conexão / timeout LLM | A | `robin-pool.ts` + `llm-errors.ts` |
| Timeout LLM 1× por step | B | `execute.ts` `loopStep--` |
| Modelo sem tools (até 3×) | B | `tool-progress.ts` |
| Build/typecheck repair no loop | B | feedback §5.5, não `validate_fail` SSE |
| Narration/gate-reply retry | A ou B | curto, sem evento de produto |
| E2B sandbox morto / template fallback | B ou C | se auto-recreate falhar → C |
| Teto Inngest ~14min | C | `platform_limit` |
| LLM esgotou A+B | C | `llm_exhausted` |

#### O que permanece automático e invisível (fora de retrial)

| Caso | Comportamento | UX |
|------|---------------|-----|
| Modelo lento | `heartbeat` 90s | Uma linha, não falha |
| Checkpoint interno | `agent_checkpoints` | Nenhum evento |
| Context compact | `context_compact_done` | Context Window |

### §2.3 — Única retomada permitida: botão **Continuar** (ação do usuário)

| Campo | Valor fechado |
|-------|---------------|
| Gatilho | `agent_runs.status = awaiting_user` |
| UI | `AssistantTurn` → `ErrorHintCard` ação `"Continuar execução"` (já existe) |
| Ação | `postAgentRun({ resume: true, mode, projectId, conversationId })` — **mesmo `run_id`** |
| Backend | `index.ts` reativa run existente (`resumeRun` L780-803) + Inngest event com `resume: true` |
| Checkpoint | `loadCheckpoint(projectId, conversationId)` restaura snapshot |
| Conta como nova mensagem? | **Não** — é extensão da mesma operação |
| Conta como auto-resume? | **Não** — usuário clicou |

**Proibido:** `step.sendEvent("re-dispatch-chunk")` em `agent-build.ts` sem `awaiting_user` prévio.

### §2.4 — Quando a operação vai para `awaiting_user`

| Motivo (`meta.awaitingUser.type`) | Condição | Mensagem user-facing |
|-----------------------------------|----------|----------------------|
| `llm_exhausted` | Retries LLM esgotados (`EXECUTE_MAX_LLM_RETRIES`) | Texto do erro + “Clique Continuar para tentar de novo” |
| `platform_limit` | Faltam ≤60s para teto Inngest 14min | “Execução longa — clique Continuar para seguir de onde parou” |
| `step_limit` | `loopStep >= maxStepsLimit` (fusível) | “Muitos passos nesta operação — Continuar ou envie instrução mais específica” |
| `clarify` | Já existe (plan/chat) | Sem mudança |
| `plan_approval` | Já existe | Sem mudança |

**Nunca** `awaiting_user` por `loopBudgetMs` — campo deletado.

### §2.5 — Teto de plataforma (único relógio)

| Camada | Limite | Uso |
|--------|--------|-----|
| Inngest `agent-build` / `agent-plan` / `agent-chat` | `timeouts.finish: "14m"` | Teto **real** por invocação |
| Cooperativa | `PLATFORM_YIELD_BUFFER_MS = 60_000` | Aos 13min, preparar `awaiting_user` + checkpoint |
| Edge `agent-run` | Só dispatch (<1s) | Sem loop |
| ~~loopBudgetMs 270s~~ | **DELETADO** | — |
| ~~MAX_RUN_WALL 45min~~ | **DELETADO** | Substituído por 14min × Continuar explícito |
| ~~MAX_CHUNK_GENERATIONS 12~~ | **DELETADO** | — |

**Decisão fechada:** não prometer 24h contínuas. Prometer **até 14min por clique Continuar**, quantos Continuares o usuário quiser.

### §2.6 — `maxStepsLimit` (fusível, não chunk)

| Item | Valor |
|------|-------|
| Fonte | `calculateMaxSteps(complexity)` — mantém |
| Ao atingir | `awaiting_user` reason `step_limit` + checkpoint — **não** auto-chunk |
| Continuar | Restaura step do checkpoint; mesmo `run_id` |

---

## §3 — Arquitetura alvo (uma página)

```
[Browser] postAgentRun (thin)
    ↓
[Edge index.ts] cria/reusa run_id → sendInngestEvent → return runId
    ↓
[Inngest agent-{build|plan|chat}] 1× step.run("execute-operation")
    ↓
[run-executor → run-job → loop.run → orchestrator → execute]
    ↓
[Stream SSE] allowlist §6 apenas
    ↓
[Terminal] finish + status completed|failed|awaiting_user|canceled
```

**Removido do diagrama:** `agent_jobs` multi-generation, `shadowEnqueueNextChunk`, `runAgentLoopWithResume` loop, `chunk_resume`, `delivery_checkpoint` público.

### §3.1 — `agent_jobs` (decisão fechada)

| Modo `AGENT_RUNTIME_V2` | Depois da limpeza |
|-------------------------|-------------------|
| `off` | Sem fila; Inngest direto (como hoje sem worker) |
| `shadow` | 1 job por run (`generation: 0`), observability only — **sem** handoff |
| `worker` | 1 job por run, lease no início, complete no terminal — **sem** `generation++` |

Arquivo `agent-chunk-limits.ts`: **deletar**.

---

## §4 — FASE A: APAGAR (inventário completo)

### A1 — Relógios e warnings

| # | Símbolo / arquivo | Ação |
|---|-------------------|------|
| A1.1 | `loopBudgetMs`, `LOOP_BUDGET_MS`, `readLoopBudgetMsFromRuntime` | DELETE |
| A1.2 | `INNGEST_LOOP_BUDGET_MS` em `run-agent-loop.ts` | DELETE |
| A1.3 | `loopBudgetExceeded()` | DELETE |
| A1.4 | `timeout_warning` evento | DELETE contrato + emitter + reducer |
| A1.5 | `runStartTime` por invocação como corte | DELETE — usar `Date.now()` vs deadline calculado uma vez no início da invocação Inngest |
| A1.6 | `LOOP_BUDGET_MS` em `run-design-dna.ts` | FORA DE ESCOPO v2 (produto Design Library); nota §10 |

### A2 — Auto-chunk / auto-resume

| # | Símbolo / arquivo | Ação |
|---|-------------------|------|
| A2.1 | `returnResumableChunk` | DELETE |
| A2.2 | `returnResumableWithUserMessage` ramo não-`pauseForUser` | DELETE — substituir por `pauseOperationForUser` §5.3 |
| A2.3 | `emitDeliveryCheckpoint` | DELETE |
| A2.4 | `persistCheckpointChat` (mensagem assistant fake entre chunks) | DELETE |
| A2.5 | `shadowEnqueueNextChunk`, `shadowCompleteJob` | DELETE callsites |
| A2.6 | `evaluateChunkLimits`, `chunkCapErrorMessage` | DELETE arquivo |
| A2.7 | `runAgentLoopWithResume` loop `for (i < maxSteps)` | DELETE — 1× `runAgentLoop` |
| A2.8 | `agent-build.ts` bloco `if (final.resumable) redispatch` L93-147 | DELETE |
| A2.9 | `resolveChunkResumeDecision` | DELETE |
| A2.10 | Eventos `chunk_resume`, `delivery_checkpoint` | DELETE contrato |
| A2.11 | Campos `chunkCap`, `resumableExhausted`, `resumeAttempts`, `betweenChunks`, `autoResuming` | DELETE front + meta |
| A2.12 | `body.autoResume` / `meta.autoResume` | DELETE — front já manda `false` |
| A2.13 | `CHUNK_HANDOFF_EVENT_TYPES` | DELETE |
| A2.14 | `zeroWritesResumableExit` → chunk | REWRITE → `awaiting_user` |

### A3 — Validação / gates SSE

| # | Símbolo | Ação |
|---|---------|------|
| A3.1 | `observe()` após cada write batch | DELETE chamada — só `ValidationPolicy` §5.4 |
| A3.2 | `emit("gate")` | DELETE |
| A3.3 | `emit("validate_fail")` / `emit("validate_ok")` intermediários | DELETE |
| A3.4 | `emit("preview_sync")` | DELETE do stream (preview tick interno no front se necessário via `file_diff`) |
| A3.5 | `BUILD FALHOU:\n` dump 2000 chars | DELETE — substituir §5.5 |
| A3.6 | `pushGate` design-uniqueness em todo run | DELETE emit; manter check opcional em log |

### A4 — Reentrada falsa

| # | Símbolo | Ação |
|---|---------|------|
| A4.1 | `orchestrator` paths `returnResumable` em gather/classify/budget | DELETE |
| A4.2 | `directive` em `loopStep === 1` sem checar `operation.directiveEmitted` | FIX — flag no snapshot §5.2 |
| A4.3 | `buildSession` recriado sem restore | FIX — snapshot §5.2 |
| A4.4 | `touchedPaths = new Set()` sem restore | FIX — snapshot §5.2 |
| A4.5 | `resumeRun` fast path que re-preflight | FIX — preflight `once per operation` §5.6 |

### A5 — Stream / contrato

| # | Item | Ação |
|---|------|------|
| A5.1 | Tipos mortos em `packages/agent-contract` | DELETE + `sync-agent-contract` |
| A5.2 | Testes que assertam chunk/resumable/budget | REWRITE ou DELETE |

### A6 — Blast radius por modo

| Modo | Callsites `returnResumable*` a remover |
|------|----------------------------------------|
| build | `execute.ts` (6), `orchestrator.ts` (3) |
| plan | `plan-turn.ts` (2) |
| chat | `chat-turn.ts` (1), `gate-replies.ts` (1) |

Todos passam a usar `pauseOperationForUser` ou terminal normal.

---

## §5 — FASE B: CONSTRUIR (mínimo — specs fechadas)

> Sem novos frameworks. Extensões em arquivos existentes.

### §5.1 — `OperationContext` (em `checkpoint.ts`, não arquivo novo obrigatório)

Persistido em `agent_checkpoints.state` + campos top-level:

```ts
type OperationSnapshot = {
  // AgentState existente (messages, phase, currentStepIndex, intent, …)
  touchedPaths: string[];
  directiveEmitted: boolean;
  buildSession: CanonicalBuildSession | null;
  validationGeneration: number;  // quantas validações full já rodaram
  operationStartedAt: string;    // ISO — mesmo run, não reinicia por Continuar
};
```

**Restaurar integralmente** em `resume: true` antes de `runBuildExecutePhase`.

### §5.2 — `pauseOperationForUser` (substitui `returnResumableWithUserMessage`)

```ts
async function pauseOperationForUser(deps, input: {
  reason: "llm_exhausted" | "platform_limit" | "step_limit";
  message: string;           // user-facing
  steps: number;
  toolsUsed: Set<string>;
}): Promise<{
  ok: false;
  awaiting: true;
  resumable: false;            // NUNCA true no payload terminal
  awaitingUser: { type: string; message: string };
  steps: number;
  toolsUsed: string[];
}>
```

**Sempre:**
1. `saveCheckpoint(force: true)` com `OperationSnapshot`
2. `transitionRun(status: awaiting_user, meta.awaitingUser)`
3. `emit("run_paused", { reason, message })` — allowlist §6
4. `emit("assistant_text", { text: message, final: true })` — fechamento parcial honesto
5. `emit("finish", { ok: false, awaiting: true })` — terminal da **invocação**, não da operação
6. **Não** enfileira Inngest
7. **Não** `persistCheckpointChat`

### §5.3 — `RetrialPolicy` (substitui §5.3 “só LLM”)

**Arquivo sugerido:** `supabase/functions/agent-run/retrial-policy.ts` (ou extensão de `llm-errors.ts`)

```ts
type RetrialLayer = "in_band" | "in_loop" | "await_user" | "terminal";

function classifyRetrial(ctx: {
  err: unknown;
  layerAttempts: { inBand: number; inLoop: number };
  loopContext?: { kind: "llm" | "no_tools" | "build_repair" | "platform" };
}): { layer: RetrialLayer; reason: string };
```

| Budget | Fonte atual | Pós-limpeza |
|--------|-------------|-------------|
| Camada A | `MAX_LLM_RETRIES=4` robin | Mantém; único lugar para HTTP transitório |
| Camada B | `MAX_TOOL_MISSES=3`, timeout 1×/step, `EXECUTE_MAX_RETRIES` build | Mantém; **não** vira chunk |
| Camada C | — | `pauseOperationForUser`; **único** caminho com novo Inngest |

**Bug atual a corrigir no PR-2:** `execute.ts` L641-649 chama `pauseForUser: true` **na primeira** falha LLM pós-robin (ramo `retries < EXECUTE_MAX_LLM_RETRIES`), ou seja, não há camada B para LLM — só A (robin) e C imediato. Alinhar: após robin esgotar, ou retenta in-loop (B) até `EXECUTE_MAX_LLM_RETRIES`, ou vai direto a C com mensagem honesta.

**Regra:** `pauseOperationForUser` só quando `classifyRetrial` retorna `await_user`, nunca quando retorna `in_band` ou `in_loop`.

### §5.4 — `ValidationPolicy` (função pura + testes)

```ts
type ValidationMode = "off" | "light" | "full";

function resolveValidationMode(input: {
  touchedPaths: Set<string>;
  hasSrcTree: boolean;        // sandbox: exists src/ with .tsx|.ts
  loopStep: number;
  isFinalGate: boolean;
  lastValidationStep: number;
}): ValidationMode;
```

| Modo | Condição (ordem de avaliação) |
|------|-------------------------------|
| `off` | `!hasSrcTree` AND todos paths ⊆ {package.json, vite.config.*, tsconfig.json, index.html} |
| `light` | `hasSrcTree` AND `!isFinalGate` AND `loopStep - lastValidationStep < 3` |
| `full` | `isFinalGate` OR (`hasSrcTree` AND `loopStep - lastValidationStep >= 3`) |

**Execução:**

| Modo | O que roda |
|------|------------|
| `off` | Nada |
| `light` | `npx tsc --noEmit` apenas |
| `full` | `observer.observe()` sem `emit gate` |

**Máximo 1 evento inspector em validação:**

```ts
emit("phase", { phase: "validate", message: "Conferindo build…" });  // interno se phase em allowlist
// OU um único RESULT via projector — decisão: usar tool_done-style summary em §6
```

**Decisão fechada:** validação **não** emite `validate_fail`. Em falha, feedback §5.5 + continue loop.

### §5.5 — Feedback LLM em falha de build

```ts
function formatBuildFeedback(observation: ObservationResult): string {
  // Máx 400 chars, 1ª falha prioritária: typescript > build > design-system
  // Formato: "[typescript] path:line — msg. Corrija com fs_edit."
}
```

Push em `state.messages` como **uma** `role: user` por ciclo de repair (dedupe por hash).

### §5.6 — Preflight design

| Regra | Valor |
|-------|-------|
| Roda | 1× por operação, quando `!snapshot.directiveEmitted` e template precisa |
| Skip | `resume: true` AND `snapshot.touchedPaths.length > 0` |
| Emite | 1× `directive` → projector `design` |

### §5.7 — Platform deadline (substitui loopBudget)

```ts
const INNGEST_FINISH_MS = 14 * 60 * 1000;
const PLATFORM_YIELD_BUFFER_MS = 60_000;

function platformDeadlineExceeded(invocationStartedAt: number): boolean {
  return Date.now() - invocationStartedAt >= INNGEST_FINISH_MS - PLATFORM_YIELD_BUFFER_MS;
}
```

No loop: se true → `pauseOperationForUser({ reason: "platform_limit", … })`.

`invocationStartedAt`: set no início de `run-job.ts` / passado no deps — **não** reset em Continuar (usa `operationStartedAt` do snapshot para telemetria; deadline é por invocação Inngest).

### §5.8 — Inngest (substituição fechada)

**`agent-build.ts` (idem plan/chat):**

```ts
const final = await step.run("execute-operation", () =>
  runAgentLoop({ ...payload, resume: payload.resume === true })
);
// Sem segundo step.run
// Sem sendEvent redispatch
// Se final.awaiting → return { awaiting: true }
// Se final.ok → mark completed
// Se !final.ok && !final.awaiting → mark failed
```

---

## §6 — Contrato de stream (allowlist fechada)

### §6.1 — Eventos permitidos no SSE (`agent_stream_events`)

| Tipo | Uso |
|------|-----|
| `start` | Início |
| `thinking_text` | Inspector thought |
| `assistant_text` | opening / narração / final |
| `tool_start` / `tool_done` | Ações |
| `file_diff` | Arquivos |
| `design` | Directive 1× |
| `task` | Tarefas / declare_tasks (futuro) |
| `alert` | Só `rate_limit`, `connection_retry` |
| `heartbeat` | Modelo lento |
| `context_usage` / `context_compact_done` | Context Window |
| `run_paused` | Só com `awaiting_user` |
| `phase` | Só `validate` com message humanizada (opcional 1 linha) |
| `finish` / `done` | Terminal |
| `canceled` | Cancelamento |
| `error` | Erro terminal |
| `step` | Só plan mode com steps legíveis |

### §6.2 — Eventos proibidos (DELETE do contrato)

`gate`, `preview_sync`, `validate_fail`, `validate_ok`, `timeout_warning`, `chunk_resume`, `delivery_checkpoint`, `delivery_checkpoint_silent`, `checkpoint_resume`, `explore` (como TASK fallback), `fsm_transition`, `classify` (stream), `chunkCap` fields em finish.

### §6.3 — Inspector (valor para usuário)

| Mostrar | Não mostrar |
|---------|-------------|
| Thought, Read/Created/Edited, Running cmd, Design 1×, Result build humano, Alert retry | Nomes de evento interno, gates, preview_sync, validate_fail cru, checkpoint entre chunks |

**Implementação primária:** não emitir (A3). **Secundária:** `timeline-builder` ignora qualquer tipo fora da allowlist (defesa).

---

## §7 — FASE C: ENTREGÁVEIS

### §7.1 — Critérios de aceite (teste LiveKit)

| ID | Critério |
|----|----------|
| AC1 | Mensagem build landing → sem parada em 270s |
| AC2 | Zero `timeout_warning` / “janela de execução” |
| AC3 | Zero `gate`/`preview_sync`/`validate_fail` no inspector |
| AC4 | Após criar só package.json+vite+tsconfig → `ValidationPolicy` = off, zero build no loop |
| AC5 | 429 simulado → alert retry, mesma operação, sem novo Inngest até esgotar retries |
| AC6 | Após retries esgotados → `awaiting_user` + botão Continuar, **sem** redispatch automático |
| AC7 | Clicar Continuar → mesmo `run_id`, restaura arquivos/step, sem directive repetido |
| AC8 | Sucesso → 1 `final: true`, status `completed` |
| AC9 | Context Window independente de mensagens de execução |

### §7.2 — Gates CI

```bash
npm run check:agent-contract   # allowlist sync
npm run test:agent-run
npm run test:agent-journey
npm run test:smoke-terminal
```

Novos (obrigatórios):

| Arquivo | Assert |
|---------|--------|
| `validation-policy.test.ts` | Modo off/light/full tabela §5.4 |
| `stream-allowlist.test.ts` | Tipos §6.2 ausentes do contrato |
| `operation-pause.test.ts` | `pauseOperationForUser` não chama enqueue |
| `no-redispatch.test.ts` | `agent-build.ts` sem `sendEvent` em resumable |

### §7.3 — Deploy

- Um release: Edge `agent-run` + Inngest bundle (`build:inngest`)
- `AGENT_RUNTIME_V2`: documentar valor em prod antes do deploy (§8)

### §7.4 — Docs

- Atualizar `AGENT_RUN_STABILIZATION.md` § Chunk/Resume → substituído por §2
- Banner em Turn Sync plan: bloqueado até AC1-AC9

---

## §8 — Pré-requisito operacional (antes do código)

Executar e colar no PR:

```bash
# Valor em produção Vercel
echo "AGENT_RUNTIME_V2=$AGENT_RUNTIME_V2"

# Confirmar: build usa Inngest (sempre desde index P0)
grep -n "agent/build.requested" supabase/functions/agent-run/index.ts
```

| Se `AGENT_RUNTIME_V2` | Ação |
|---------------------|------|
| `off` | Demolição A2 jobs simplificada |
| `shadow` | Manter 1 job observability, sem handoff |
| `worker` | Manter lease, remover generation++ |

---

## §9 — Plano de PRs (2 PRs — decisão fechada)

### PR-1 `feat/execution-sanity-demolition`

- Tudo §4 (Fase A)
- Testes ajustados para compilar
- **Pode** ficar vermelho em jornada se removido resumable — OK se PR-2 em stack

### PR-2 `feat/execution-sanity-operation`

- Tudo §5 (Fase B)
- §6 allowlist + sync contract
- §7 gates verdes
- Deploy

**Sem PR-3..7.** Dois PRs em stack Graphite ou sequência rápida.

---

## §10 — Fora de escopo v2

| Item | Motivo |
|------|--------|
| `run-design-dna.ts` LOOP_BUDGET | Produto Design Library separado |
| Refator `loop.ts` monólito | Já fatiado em phases |
| Turn Sync PR-D `declare_tasks` | Após §7 verde |
| Prometer runtime >14min sem Continuar | Limite Inngest hard |

---

## §11 — Relação Turn Synchronizer

| Entregue | Mantém |
|----------|--------|
| PR-A TurnGuide | Sim |
| PR-B ActionLedger | Sim |
| PR-C opening/closing | Sim |
| PR-D declare_tasks | **Bloqueado** |

TurnGuide `block_read_gate` etc. permanecem; `observe` pós-write não.

---

## §12 — Aprovação

- [ ] §2 Contrato de produto (sem auto-resume; Continuar explícito)
- [ ] §4 Demolição agressiva
- [ ] §5 Construção mínima
- [ ] §6 Allowlist
- [ ] §9 Dois PRs
- [ ] §8 Inventário prod (preencher antes merge)

**Assinatura:** _______________ **Data:** _______________

---

## Apêndice A — Mapa delete → substitute

| Remove | Substitui por |
|--------|---------------|
| `loopBudgetExceeded` | `platformDeadlineExceeded` (só → `awaiting_user`) |
| `returnResumableChunk` | — (deletado) |
| `returnResumableWithUserMessage` (non-pause) | — (deletado) |
| `returnResumableWithUserMessage` (pause) | `pauseOperationForUser` |
| `observe()` pós-write | `resolveValidationMode()` |
| `emit("gate")` | `logger.event("observer.gate", …)` |
| `runAgentLoopWithResume` | 1× `runAgentLoop` |
| Inngest redispatch | Usuário Continuar → novo evento (ação explícita) |
| Checkpoint parcial | `OperationSnapshot` §5.1 |

---

## Apêndice B — Fluxo Continuar (sequência)

```
1. Operação em awaiting_user (run_id=R)
2. Usuário clica Continuar
3. postAgentRun({ resume: true }) 
4. index.ts: status R → running, loadCheckpoint
5. Inngest agent/build.requested { runId: R, resume: true }
6. run-job: restore OperationSnapshot, orchestrator skip gather
7. execute continua de currentStepIndex, directiveEmitted true
8. Loop até completed OU novo awaiting_user OU failed
```

Nenhum passo automático entre 1 e 2.

---

## Apêndice C — Por que existem chunk limits / chunk resume (histórico)

**Problema original (jun/2026, Fase 0):** runs longas morriam como `failed` quando o loop ainda era `resumable`. O fix foi **re-dispatch automático** Inngest + caps anti-zumbi.

| Peça | Problema que tentava resolver | Por que virou dor hoje |
|------|------------------------------|------------------------|
| `loopBudgetMs` 90s/270s | Edge/Inngest timeout | Corta operação saudável; confunde com Context Window |
| `returnResumableChunk` | Persistir entre invocações | Emite `delivery_checkpoint` + prose de “continuo sozinho” |
| `evaluateChunkLimits` (12 gen, 45min wall) | Run zumbi infinita | Mistura **fusível** com **produto** |
| `CHUNK_HANDOFF_GAP_MS` | Stale detector matando handoff | Legitima `running` sem heartbeat real |
| `shadowEnqueueNextChunk` | Fila `agent_jobs` por geração | Segunda operação na mesma mensagem |
| `chunk_resume` SSE | Front saber que voltou | Usuário vê restart; `autoResuming` mentiroso |

**Substituto (sem auto-resume):** uma invocação usa até 14min; se precisar mais → camada C (Continuar). Fusíveis (`maxSteps`, build-fix cap) → `awaiting_user`, não chunk. Stale detector volta a confiar só em `heartbeat_at` + `running`.

---

## Apêndice D — Blast radius (o que quebra se apagar)

> **Não apagar no escuro.** Cada linha: dependente → comportamento se remover → substituto obrigatório.

### D1 — `agent-chunk-limits.ts` (arquivo inteiro)

| Importador | Quebra se sumir sem substituto | Substituto |
|------------|--------------------------------|------------|
| `run-executor.ts` L449-551 | Chunk handoff para de funcionar | Remover bloco inteiro; terminal ou `pauseOperationForUser` |
| `agent-chunk-limits.test.ts` | Testes RED | Deletar ou reescrever para `RetrialPolicy` |
| `_shared.ts` (duplicata `evaluateChunkResumptionExhausted`) | Inngest redispatch sem cap | Deletar com redispatch |

**Não quebra:** robin retry, tool miss, build repair — são camadas A/B, arquivos separados.

### D2 — Símbolos de handoff (callsites)

| Símbolo | Arquivos | Se remover | Substituto |
|---------|----------|------------|------------|
| `returnResumableChunk` | `infra.ts`, `deps-factory.ts` | Budget/maxSteps não auto-continuam | `pauseOperationForUser` ou seguir loop |
| `returnResumableWithUserMessage` (sem pause) | `execute.ts`, `plan-turn.ts`, `chat-turn.ts`, `orchestrator.ts` | Saídas resumable somem | Mapear cada callsite → C ou terminal |
| `shadowEnqueueNextChunk` | `run-executor.ts` | Worker mode sem próximo job | 1 job/run; Continuar cria evento novo |
| `shadowCompleteJob` (handoff) | `run-executor.ts` | Jobs ficam `leased` | Complete no terminal da invocação |
| `resolveChunkResumeDecision` | `agent-build/plan/chat.ts` | Redispatch para | Deletar bloco L93-147 |
| `runAgentLoopWithResume` | `_shared.ts`, 3 handlers | Só 1× execute por evento | `runAgentLoop` direto |
| `emitDeliveryCheckpoint` | `infra.ts` | Front perde `deliveryFiles` | `file_diff` + checkpoint interno |
| `persistCheckpointChat` | `persist.ts` | Sem mensagem fake entre chunks | OK — desejado |
| `betweenChunks` meta | `run-executor.ts`, `persist.ts` | Stale skip some | Remover skip; heartbeat honesto |
| `chunk_resume` evento | `run-executor.ts`, contract, front | `autoResuming` nunca true | Remover reducer + smoke assert |

### D3 — Frontend / scripts / ops

| Arquivo | Dependência | Pós-remoção |
|---------|-------------|-------------|
| `agent-progress.ts` | `chunk_resume`, `chunkCap`, `delivery_checkpoint` | Remover campos; `resumable` só de `run_paused`/finish |
| `AssistantTurn.tsx` / handlers | `resumable`, Continuar | Mantém; fonte vira `awaiting_user` |
| `timeline-builder.ts` | fallback `ev.type` | Allowlist §6 (defesa) |
| `assistant-materialized.ts` | `betweenChunks` | Só `awaiting_user` |
| `check-stale-runs.mjs` + `stale-run-filter.mjs` | skip chunk handoff | Simplifica regra |
| `smoke-terminal.mjs` | `chunk_resume` = terminal honesto | Assert `run_paused` ou `finish` |
| `ensure-terminal-message.ts` | `betweenChunks` guard | Remover guard |
| `agent-pending-queue.ts` | `CHUNK_HANDOFF_GAP_MS` | Fila não trata handoff |

### D4 — O que **não** quebra (falso alarme)

| Componente | Por quê |
|------------|---------|
| Turn Sync PR-A/B/C | Não depende de chunk |
| `agent_jobs` lease (1 job/run) | Mantém em `shadow`/`worker` sem `generation++` |
| LLM retry robin | Independente de chunk |
| Botão Continuar | Já existe; só muda o gatilho (`awaiting_user`) |
| Checkpoint `agent_checkpoints` | Mantém; ganha `OperationSnapshot` §5.1 |

### D5 — Ordem segura de demolição (PR-1)

1. Parar redispatch Inngest (`agent-build.ts` primeiro — maior risco UX)
2. Remover bloco chunk em `run-executor.ts`
3. Trocar saídas `returnResumable*` por `pauseOperationForUser` / terminal
4. Deletar `agent-chunk-limits.ts` + duplicata em `_shared.ts`
5. Limpar front/scripts/tests (compilação verde antes de PR-2)

**Risco residual:** `AGENT_RUNTIME_V2=worker` sem `shadowEnqueueNextChunk` — validar §8 antes do merge.

---

*Fim do plano qualificado v2.*