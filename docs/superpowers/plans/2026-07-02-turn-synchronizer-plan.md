# Turn Synchronizer — Plano de Implementação por Etapas

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` ou `subagent-driven-development`. Uma etapa por PR. Nenhuma etapa seguinte começa sem gate verde da anterior.

**Goal:** Substituir a FSM escondida `discovery|write` por um loop síncrono Lovable (pensa→lê→escreve→lê…) com Turn Guide, sem regressão de chat, inspector ou jornada.

**Architecture:** Quatro camadas — (1) contrato de turno Lovable no front, (2) Work Loop único no `execute.ts` com tools sempre completas, (3) `TurnGuide` com gates duros + nudges suaves, (4) plataforma FORGE (sandbox, design directive, Context Window já feito).

**Tech Stack:** Deno `agent-run`, Vitest jornada/Lovable, `check:deploy-gates`, Supabase deploy só após gate local.

---

## 0. Ponto de inflexão (por que plano por etapas)

O risco não é “não saber a arquitetura certa”. O risco é **migração paralela**:

| Anti-padrão | Consequência |
|-------------|--------------|
| Apagar discovery e deixar mocks velhos | `execute.test.ts` passa, produção quebra |
| Mudar backend e front no mesmo PR | Regressão invisível no mini-card |
| Fallback hardcoded (“se não narrou, põe texto X”) | UX mente; invariante Lovable quebra |
| Deploy antes do gate | Produção vira laboratório |
| “Depois eu arrumo os testes” | Nunca arruma |

**Regra de ouro:** cada etapa entrega **um comportamento completo** + **testes que provam** + **código morto removido no mesmo PR**.

---

## 1. Inventário — o que já existe vs o que falta

### ✅ Já implementado (não reabrir)

| Item | Evidência |
|------|-----------|
| Context Window (`SessionContextManager`) | `compression.ts`, `ContextWindowIndicator.tsx` |
| Eventos `context_usage` / `context_compact_done` | `_events.ts`, `agent-progress.ts` |
| Timeout 180s + `pauseForUser` em erros LLM | `llm-chat.ts`, `execute.ts`, `infra.ts` |
| Stream seq late events | `agent-run-stream.ts` |
| Contrato Lovable documentado | `AGENT_PLATFORM_MASTER_PLAN.md`, `lovable-acceptance.test.ts` |

### ❌ Ainda pendente (este plano)

| Item | Arquivos principais |
|------|---------------------|
| Matar `discovery\|write` | `execute-helpers.ts`, `execute.ts`, `loop-mutable-state.ts`, `deps-factory.ts`, `meta.ts` |
| `TurnGuide` (gates + nudges) | **novo** `runtime/turn-guide.ts` |
| `ActionLedger` (stall detection) | **novo** `runtime/action-ledger.ts` |
| Mini-card projector (1 linha viva) | `forge-run.ts`, `ChatJobTasksCard.tsx` |
| Opening/closing choke (todos os exits) | `execute.ts`, `plan-turn.ts`, `chat-turn.ts` |
| `declare_tasks` em build longo | `execute.ts` + spec mini-card |

---

## 2. Regras de execução (obrigatórias)

1. **Um PR = uma etapa.** Sem “já que estou aqui”.
2. **TDD onde possível:** teste falha → implementa → passa → commit.
3. **Deletar no mesmo PR que adiciona.** Se `resolveBuildToolPhase` sai, testes que dependem dela saem ou são reescritos no mesmo diff.
4. **Proibido fallback user-facing novo** sem linha na spec. Erro honesto > frase inventada.
5. **Gate antes de merge:** comando listado na etapa; output colado no PR.
6. **Deploy Supabase:** só após `npm run test:agent-run` + `npm run test:agent-journey` verdes na etapa.
7. **Worktree isolado** (`using-git-worktrees`) se duas etapas em paralelo.

### Comandos de gate (referência)

```bash
# Backend mínimo (toda etapa que mexe em agent-run)
npm run test:agent-run

# Contrato Lovable + jornada (etapas front ou eventos)
npm run test:agent-journey

# Contrato de eventos (se mexer em _events / agent-contract)
npm run check:agent-contract

# Gate completo pré-merge final
npm run check:deploy-gates
```

---

## Etapa 0 — Baseline (sem código de produto)

**Objetivo:** Fotografia do estado atual. Nenhuma implementação.

- [ ] Rodar `npm run test:agent-run` — registrar pass/fail
- [ ] Rodar `npm run test:agent-journey` — registrar pass/fail
- [ ] `git grep resolveBuildToolPhase` — listar todos os callsites
- [ ] Abrir issue/PR body template com checklist de gates

**DoD:** Documento de baseline anexado ao PR-0 ou comentário no primeiro PR real.

---

## Etapa 1 — PR-A: Demolição discovery/write + TurnGuide v1

**Branch:** `feat/turn-sync-pr-a-kill-discovery`

**Goal:** Loop de build com **tools sempre completas**. Gates duros só via `TurnGuide`. Zero `BuildToolPhase`.

### Arquivos

| Ação | Arquivo |
|------|---------|
| **Delete lógica** | `execute-helpers.ts` — remover `BuildToolPhase`, `resolveBuildToolPhase`, `READ_ONLY_BATCH_ESCALATE`, `WRITE_PHASE_MIN_STEP` |
| **Modify** | `execute.ts` — remover `mergeWriteModeToolDefinitions`, `FORCE_WRITE_USER_MESSAGE` injetada, `prepareForceWriteTurn` baseado em fase |
| **Modify** | `loop-mutable-state.ts`, `deps-factory.ts` — remover `buildToolPhase` |
| **Keep** | `assertDesignReadsDone` — mover chamada para `TurnGuide` |
| **Create** | `runtime/turn-guide.ts` |
| **Create** | `runtime/turn-guide.test.ts` |
| **Modify** | `execute-helpers.test.ts` — remover testes de `resolveBuildToolPhase`; adicionar testes TurnGuide |
| **Modify** | `execute.test.ts`, `closure-paths.test.ts` — mocks atualizados |

### `TurnGuide` v1 — interface mínima

```ts
export type TurnGuideInput = {
  readPaths?: string[];
  readsDone: Set<string>;
  patchCalls: ToolCall[];
  consecutiveReadOnlyBatches: number;
  approvedPlanBuild: boolean;
  touchedPathsCount: number;
  loopStep: number;
  readGateBlockCount: number;
};

export type TurnGuideDecision =
  | { action: "proceed" }
  | { action: "block_read_gate"; message: string; missing: string[] }
  | { action: "nudge_stall"; message: string }      // explore only, não user message
  | { action: "pause_zero_writes"; message: string }; // resumable exit

export function evaluateTurnGuide(input: TurnGuideInput): TurnGuideDecision;
```

### Comportamento esperado (testes obrigatórios)

| Cenário | Resultado |
|---------|-----------|
| 3 batches só read, zero writes | `nudge_stall` (não bloqueia) |
| patch UI sem read_paths lidos | `block_read_gate` |
| 2 blocks read gate | relax (como hoje) |
| approved build, step≥N, zero touched | `pause_zero_writes` |
| Qualquer outro | `proceed` |

### O que NÃO fazer neste PR

- Não mexer em `ChatComposer`, `forge-run`, mini-card
- Não adicionar fallback de narração
- Não mudar eventos do contrato

### Gate Etapa 1

```bash
cd supabase/functions/agent-run && deno test --allow-env --allow-read --allow-net \
  runtime/turn-guide.test.ts \
  runtime/phases/execute.test.ts \
  runtime/phases/closure-paths.test.ts \
  runtime/phases/execute-helpers.test.ts
npm run test:agent-run
npm run test:agent-journey   # deve permanecer verde — não mexemos no front
```

**DoD:** `git grep resolveBuildToolPhase` retorna vazio. Deploy `agent-run` após gate.

---

## Etapa 2 — PR-B: ActionLedger + Mini-card projector

**Branch:** `feat/turn-sync-pr-b-minicard-projector`

**Depends on:** PR-A merged

**Goal:** Mini-card mostra **1 linha viva** derivada da timeline, não dump de `tools[]`.

### Arquivos

| Ação | Arquivo |
|------|---------|
| **Create** | `src/lib/chat/action-ledger.ts` (pure: última ação → label) |
| **Create** | `src/lib/chat/action-ledger.test.ts` |
| **Modify** | `src/lib/forge-run.ts` — `buildMiniCardHeader` usa projector |
| **Modify** | `src/lib/lovable-acceptance.test.ts` — casos "Lendo X", "Editando X" |
| **Modify** | `src/lib/chat/invariants.test.ts` — garantir ordem DOM intacta |

### Mapeamento projector

| Evento / tool | Linha viva |
|---------------|------------|
| `tool_start` fs_read path | `Lendo {path}…` |
| `tool_start` fs_edit/fs_write | `Editando {path}…` |
| `tool_start` shell_exec | `Executando {command}…` |
| `phase: compact` | `Compactando contexto…` |
| `finished` + diffs | `☑ N arquivos alterados` |

### Gate Etapa 2

```bash
npm run test:agent-journey
npm run build   # exit 0
```

**DoD:** Nenhum mini-card header genérico "Working" quando há tool ativa (teste Lovable).

---

## Etapa 3 — PR-C: Opening/closing choke (todos os exit paths)

**Branch:** `feat/turn-sync-pr-c-opening-closing`

**Depends on:** PR-B merged

**Goal:** Todo caminho de saída de `execute.ts`, `plan-turn.ts`, `chat-turn.ts` emite `assistant_text` com contrato (`opening` / `final`).

### Método

1. Listar todos os `return` em `execute.ts` (grep)
2. Para cada um: ou emite closing via `emitClosingAndPersist`, ou teste dedicado prova evento
3. **Proibido** string hardcoded nova — só re-call LLM com instrução de closing (spec `chat-turn-ux-design.md`)

### Arquivos

- `execute.ts`, `plan-turn.ts`, `chat-turn.ts`
- `runtime/phases/closure-paths.test.ts` — expandir tabela driven
- `src/lib/chat/agent-turn-flow.test.ts`

### Gate Etapa 3

```bash
npm run test:agent-run
npm run test:agent-journey
npm run test:smoke-terminal
```

**DoD:** `closure-paths.test.ts` cobre 100% dos exit labels listados em comentário no topo do arquivo.

---

## Etapa 4 — PR-D: declare_tasks em build + checklist

**Branch:** `feat/turn-sync-pr-d-declare-tasks`

**Depends on:** PR-C merged

**Goal:** Build longo declara tarefas atômicas; mini-card checklist como Plan mode.

### Escopo

- Após step 1 em `approvedPlanBuild`, soft-require `declare_tasks` (nudge, não strip tools)
- `ChatJobTasksCard` já existe — wire com `AgentProgress.tasks`
- Teste: build com 3 tasks → checklist visível no `lovable-acceptance`

### Gate Etapa 4

```bash
npm run test:agent-journey
npm run check:deploy-gates
```

---

## Etapa 5 — Validação integrada (humano + CI)

- [ ] `npm run check:deploy-gates` verde
- [ ] Deploy Supabase `agent-run` + Vercel produção (git push main)
- [ ] Checklist browser §1 do `AGENT_PLATFORM_MASTER_PLAN.md` (staging)
- [ ] Run de regressão: build longo sem `context_compress` no chat, com `context_usage` no dot

---

## 3. Matriz de regressão (o que cada etapa não pode quebrar)

| Invariante | Teste guardião |
|------------|----------------|
| Ordem DOM Thinking→Narração→Card→Closing | `invariants.test.ts` |
| Mini-card nunca só "Working" com tool ativa | `lovable-acceptance.test.ts` |
| Checkpoint ≠ terminal | `agent-turn-flow.test.ts` |
| Stream catch-up pós-F5 | `assistant-run-progress.test.ts` |
| Inspector timeline | `inspector-live-stream.test.ts` |
| Exit paths com prosa | `closure-paths.test.ts` |
| Event contract sync | `check:agent-contract` |

**Regra:** se um teste guardião quebra, a etapa **reverte** — não patch no teste sem entender.

---

## 4. Ordem de merge (stack)

```
main
 └── PR-A  kill discovery + TurnGuide     ← desbloqueador
      └── PR-B  mini-card projector
           └── PR-C  opening/closing choke
                └── PR-D  declare_tasks
                     └── Etapa 5  deploy + browser
```

**Não fazer cherry-pick entre PRs.** Stack linear.

---

## 5. Como o agente (eu) executa sem deixar pela metade

Por etapa:

1. Ler esta seção + arquivos listados
2. Criar branch / worktree
3. Escrever testes que falham
4. Implementar mínimo
5. Rodar gate completo da etapa
6. `code-reviewer` subagent ou `/review` no diff
7. Commit + push + PR com output dos gates colado
8. **Só então** pedir merge e iniciar próxima etapa

Se gate falhar: **não commitar workaround**. Corrigir causa ou reduzir escopo da etapa.

---

## 6. Critério de sucesso final (north star)

Um build de 10+ steps onde o usuário vê:

1. Pensando → Narração em &lt;5s
2. Sequência síncrona: Lendo… → Editando… → Lendo… (mini-card)
3. Zero alerta `context_compress` no chat; dot de contexto funciona
4. Fechamento após job terminar
5. Sem auto-resume após erro; pause honesto
6. `check:deploy-gates` verde

---

## Referências

- `docs/AGENT_PLATFORM_MASTER_PLAN.md` — contrato jornada
- `docs/superpowers/specs/2026-06-26-chat-turn-ux-design.md` — turno assistant
- `docs/DESIGN_AGENT_INFLECTION_PLAN.md` — read_paths gate (já parcialmente feito)