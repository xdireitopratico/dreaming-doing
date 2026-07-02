# Agent Run Stabilization

> Documento vivo de recuperação do contrato `agent_run`. Atualizar este arquivo ao concluir cada tarefa, com evidência de teste/build/log.

## Objetivo

Salvar o fluxo de vibecoding (`agent_run`) estabilizando o contrato entre frontend, Supabase Edge Functions, Inngest, executor, sandbox/preview e providers LLM.

## Estado Inicial Confirmado

Data: 2026-06-21
Branch de trabalho: `stabilize-agent-run-contract`

### Evidências Locais

- `npm run build`: passa.
- `npm run build:inngest`: passa.
- `npm run test -- --run`: falha em contrato de progresso e import dinâmico do executor.
- Testes Deno do `agent-run`: 180 passam, 5 falham em eventos/contrato do loop.
- `npm run typecheck`: falha por drift amplo de tipos e contratos.

### Evidências de Produção

- Supabase projeto `dpduljngdurfpmaclffa`, últimos 7 dias: 28 runs `failed`, 25 `completed`, 2 `canceled`, 1 `running`.
- Buckets recorrentes: limite de iterações, runs zumbis, resposta LLM vazia/sem tool, falha de build, erro NVIDIA NIM, preview/deploy 500.

## Diagnóstico

O problema principal não é um único bug. O contrato do `agent_run` divergiu entre produtor e consumidor:

- O loop emite alguns eventos de progresso somente em caminhos específicos.
- O frontend ignora parte dos dados enviados em `delivery_checkpoint`.
- O fluxo chunk/resume pode finalizar o mesmo erro com metadados diferentes.
- Providers LLM têm capacidades diferentes de tool-calling e alguns adapters deixam respostas vazias/sem tools quebrarem o fluxo.
- `npm run build` não protege contra `typecheck`, Deno tests e contratos runtime quebrados.

## Contrato Desejado

### Status

- `pending`: run criado, ainda não começou.
- `running`: run ativo ou aguardando retomada automática entre chunks.
- `awaiting_user`: run pausado por decisão explícita do usuário.
- `completed`: entrega final validada.
- `failed`: falha terminal não recuperável.
- `canceled`: cancelamento solicitado.

### Eventos Essenciais (allowlist §6 execution sanity v2)

- `start`, `thinking_text`, `assistant_text`, `tool_start` / `tool_done`, `file_diff`, `design`, `directive` (1× por operação).
- `run_paused`: pausa honesta com `awaiting_user` — única retomada via botão **Continuar** (mesmo `run_id`).
- `phase` (validate), `heartbeat`, `alert` (`rate_limit`, `connection_retry`), `context_usage` / `context_compact_done`.
- `finish` / `done`: terminal da invocação Inngest (não confundir com fim da operação quando `awaiting: true`).

**Removidos do stream:** `gate`, `preview_sync`, `validate_fail`/`validate_ok`, `timeout_warning`, `chunk_resume`, `delivery_checkpoint`, auto-chunk.

### Operação e retomada (substitui Chunk/Resume)

- **1 mensagem = 1 operação** até terminal ou pausa explícita (`awaiting_user`).
- Teto por invocação Inngest: **14min**; aos ~13min → `platform_limit` + checkpoint + `run_paused`.
- **Continuar** (ação do usuário): `postAgentRun({ resume: true })` — mesmo `run_id`, restaura `OperationSnapshot` (`touchedPaths`, `buildSession`, `directiveEmitted`, step).
- Retrial: camada A (robin/transitório), B (in-loop repair), C (Continuar) — **sem** auto-dispatch Inngest entre chunks.
- `maxStepsLimit` atingido → `step_limit` + `awaiting_user`, não auto-chunk.

## Plano de Execução

### Task 1: Frontend Progress Contract

Status: `completed`

Arquivos:

- `src/lib/agent-progress.ts`
- `src/hooks/agent-progress.test.ts`
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: o frontend perde progresso porque `delivery_checkpoint.step` e `delivery_checkpoint.totalSteps` só são aplicados quando `plan === true`, mas o backend já envia esses campos em checkpoints silenciosos de build.

Critério de conclusão:

- Teste de `delivery_checkpoint silencioso mantém progresso sem pausar` passa.
- O reducer preserva checkpoint silencioso como progresso real quando `step`/`totalSteps` são números.

Evidência:

- RED: `npm run test -- src/hooks/agent-progress.test.ts --run` falhou em `delivery_checkpoint silencioso mantém progresso sem pausar`, recebendo `currentStep=null` em vez de `3`.
- GREEN: `npm run test -- src/hooks/agent-progress.test.ts --run` passou com 31 testes.
- Decisão de contrato: `delivery_checkpoint.step` e `delivery_checkpoint.totalSteps` são progresso válido sempre que forem números, independente de `plan === true`.

### Task 2: Agent Loop Step Event Contract

Status: `completed`

Arquivos prováveis:

- `supabase/functions/agent-run/loop.ts`
- `supabase/functions/agent-run/loop.test.ts`
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: o loop normal de build deixou de emitir `step`, enquanto testes/UI ainda dependem desse evento para execução não-planejada.

Critério de conclusão:

- Testes Deno que reclamam de `step` passam ou são atualizados para o contrato canônico com justificativa.
- O caminho normal de build tem sinal de progresso consistente.

Evidência:

- RED: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/loop.test.ts` falhou em 5 testes; `18 executionLog populado` e `22 smoke test — eventos principais` reclamavam ausência de `step`.
- GREEN parcial da tarefa: após emitir `step` no caminho normal de build, o mesmo comando reduziu para 3 falhas; os testes `18 executionLog populado` e `22 smoke test — eventos principais` passaram.
- Decisão de contrato: build não-planejado também emite `step` com `current=loopStep` e `total=maxStepsLimit`.

### Task 3: Resume/Restored Event Contract

Status: `completed`

Arquivos prováveis:

- `supabase/functions/agent-run/loop.ts`
- `supabase/functions/agent-run/loop.test.ts`
- `src/inngest/functions/_shared.ts`
- `src/inngest/functions/agent-build.ts`
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: o resume emite transições novas, mas testes/consumidores ainda esperam um evento compatível de restauração (`classify restored`).

Critério de conclusão:

- Teste de restore passa.
- O contrato de retomada fica explícito e compatível.

Evidência:

- RED: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/loop.test.ts --filter "resume checkpoint"` falhou porque o consumidor esperava `classify.restored=true`, mas o loop só emitia transição FSM.
- GREEN: o mesmo teste focado passou após manter o FSM e reintroduzir evento compatível `classify` com `restored=true`.
- Regressão ampla: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/loop.test.ts` reduziu para 2 falhas, ambas no contrato no-tool/LLM.

### Task 4: No-Tool/Empty LLM Response Contract

Status: `completed`

Arquivos prováveis:

- `supabase/functions/agent-run/loop.ts`
- `supabase/functions/agent-run/loop.test.ts`
- providers/adapters relacionados, se necessário.
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: respostas textuais sem tool em modo não-forçado estão sendo classificadas como falha em cenários onde deveriam ser aceitas ou convertidas em etapa narrável.

Critério de conclusão:

- Teste Deno `LLM sem tool_calls — (type other, not forced)` passa.
- Falhas reais continuam falhando quando resposta é vazia e sem ação.

Evidência:

- RED: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/loop.test.ts` ainda falhava em `9 forceTools — LLM retorna texto sem tools` e `14 LLM sem tool_calls — (type other, not forced)`.
- RED adicional: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/router.test.ts` falhou porque prompt explicativo longo era classificado como `modify`.
- GREEN: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/router.test.ts` passou com 2 testes.
- GREEN: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/tool-progress.test.ts` passou com 5 testes.
- GREEN: `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/loop.test.ts` passou com 43 testes.
- Decisão de contrato: prompts puramente explicativos são `other`; prompts acionáveis sem tool recebem nudge explícito com a frase `agora use ferramentas`.

### Task 5: Inngest Executor Import/Test Packaging

Status: `completed`

Arquivos prováveis:

- `src/inngest/executor/run-agent-loop.ts`
- `scripts/build-agent-executor.mjs`
- `scripts/build-inngest.mjs`
- testes Inngest/Vitest relacionados.
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: o import dinâmico funciona no bundle de produção, mas quebra em Vitest porque o arquivo gerado existe em `dist/server`, não em `src/inngest/executor`.

Critério de conclusão:

- `npm run test -- --run` não apresenta erro não tratado de import de `agent-executor.js`.
- O bundle de produção continua gerando `dist/server/agent-executor.js` e `dist/server/inngest-handler.js`.

Evidência:

- RED: `npm run test -- --run` tinha 377 testes passando, mas falhava por erro não tratado: `Cannot find module ... src/inngest/executor/agent-executor.js`.
- GREEN: `npm run test -- --run` passou com 64 arquivos e 377 testes.
- GREEN: `npm run build:inngest` passou e gerou `dist/server/agent-executor.js` e `dist/server/inngest-handler.js`.
- Decisão de contrato: import do executor é lazy; testes que só importam helpers Inngest não carregam artefato de produção antecipadamente.

### Task 7: Terminal Contract AC1 (Choke Point Unificado)

Status: `completed`

Arquivos:

- `supabase/functions/agent-run/runtime/terminal-user-message.ts`
- `supabase/functions/agent-run/runtime/infra.ts`
- `supabase/functions/agent-run/runtime/deps-factory.ts` (wire `returnResumableWithUserMessage` em `createDepsContext`)
- `supabase/functions/agent-run/runtime/phases/execute.ts`
- `supabase/functions/agent-run/runtime/phases/orchestrator.ts`
- `supabase/functions/agent-run/runtime/loop-orchestrator-deps.ts`
- `supabase/functions/_shared/ensure-terminal-message.ts`
- `scripts/check-agent-run-terminal.mjs`
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: o erro legado `"O modelo não respondeu com a mensagem esperada"` persistia por (1) `returnResumableWithUserMessage` **não wired** em `createDepsContext` (fallback silencioso para chunk sem prosa), (2) orchestrator com 3 saídas bare `returnResumableChunk`, (3) safety net `_shared/ensure-terminal-message` sem fallback absoluto.

Critério de conclusão:

- `npm run check:agent-run-terminal` passa.
- `npm run test:agent-run` passa (21 testes).
- `npm run build:inngest` passa.
- Deploy Vercel (Inngest bundle) + `supabase functions deploy agent-run` pendente de push/CI.

Evidência:

- GREEN: `npm run check:agent-run-terminal` — OK.
- GREEN: `npm run test:agent-run` — 21 passed, 0 failed.
- GREEN: `npm run build:inngest` — `agent-executor.js` + `inngest-handler.js` gerados.
- Fix crítico: `createDepsContext` agora expõe `returnResumableWithUserMessage` (antes undefined → phases caíam em chunk sem mensagem).

### Task 8: Loop Materialization + UX Hygiene

Status: `completed`

Arquivos:

- `supabase/functions/agent-run/runtime/phases/execute-helpers.ts`
- `supabase/functions/agent-run/runtime/phases/execute.ts`
- `supabase/functions/agent-run/tools/meta.ts`
- `supabase/functions/agent-run/runtime/llm-chat.ts`
- `supabase/functions/agent-run/runtime/loop-mutable-state.ts`
- `supabase/functions/agent-run/runtime/emitter.ts`
- `supabase/functions/agent-run/loop-status.ts`
- `src/components/chat/AssistantTurn.tsx`
- `src/routes/projects/$projectId/useEditorPageHandlers.ts`

Hipótese: builds aprovados morriam em leitura (`tool_choice: required` + contador read-only) sem `fs_write`; UX exibia stuck/Feito/Continuar mentiroso.

Critério de conclusão:

- Fases `discovery` → `write` com `mergeWriteModeToolDefinitions` em approved plan build.
- Sem terminal com `touchedPaths=0` antes de turno write forçado.
- Sem alert error em `stuck`; `tool_batch` ok silencioso.
- Continuar aciona `onResume` quando copy promete retomada.
- `npm run test:agent-run` passa; `npm run build:inngest` passa.

Evidência:

- GREEN: `npm run test:agent-run` — 22 passed (incl. escalada read→write em approved build).
- GREEN: `npm run build:inngest`.
- GREEN: `npm run check:agent-run-terminal`.

### Task 6: Typecheck Drift Inventory

Status: `pending`

Arquivos prováveis:

- tipos Supabase gerados.
- componentes chat/design-library/flow-builder.
- `docs/AGENT_RUN_STABILIZATION.md`

Hipótese: há múltiplos contratos TypeScript divergentes que não bloqueiam o build Vite, mas impedem CI confiável.

Critério de conclusão:

- Inventário final de categorias de erro e ordem de correção.
- Se couber no ciclo atual, reduzir o conjunto de erros sem misturar com runtime.

Evidência:

- Pendente.

## Histórico de Atualizações

- 2026-06-21: Documento criado com baseline e plano inicial de estabilização.
- 2026-06-21: Task 1 concluída; reducer de progresso agora aceita `step`/`totalSteps` em `delivery_checkpoint` silencioso.
- 2026-06-21: Task 2 concluída; loop normal de build voltou a emitir evento `step`.
- 2026-06-21: Task 3 concluída; retomada por checkpoint voltou a emitir `classify.restored=true` junto do FSM.
- 2026-06-21: Task 4 concluída; contrato no-tool diferencia explicação textual de pedido acionável que precisa usar ferramentas.
- 2026-06-21: Task 5 concluída; import do executor Inngest deixou de quebrar Vitest sem bundle.
- 2026-07-01: Task 7 concluída; choke point terminal unificado (`ensureUserMessage` + `returnResumableWithUserMessage` wired); orchestrator e ensure-terminal-message alinhados; 21 testes Deno + guardrail `check:agent-run-terminal`.
- 2026-07-01: Task 8 concluída; materialização read→write em approved build, invariante zero-writes resumable, higiene stuck/Feito/Continuar.
