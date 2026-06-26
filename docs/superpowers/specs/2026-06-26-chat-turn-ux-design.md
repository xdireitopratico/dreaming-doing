# Chat Turn UX — Especificação (FORGE 2.2)

> **Status:** proposta para aprovação do usuário antes de implementação.
> **Escopo:** fluxo completo de um turno assistant no chat: pensamento → narração → mini-card → fechamento.
> **Objetivo:** nunca deixar o usuário sem interação visível; o mini-card deve ser um widget de estado real do job, não um dump de ferramentas.

---

## 1. Problemas atuais

1. **Narração falha silenciosamente.** O backend em build/execute não emite `assistant_text` de abertura (`opening: true`). O turno fica preso em "Pensando…" até o fechamento final.
2. **Fechamento não acontece em todos os caminhos de erro.** Em fail-fast, resumable chunk, read-only hard-stop, tool-miss, o backend pode retornar sem `assistant_text` final visível.
3. **Mini-card vira dump de tools.** `ChatJobCard` mostra até 5 linhas de `activity` (`fs_read`, `shell_exec`, `fs_edit`). Isso não comunica estado; polui o chat.
4. **Falta tarefas atômicas no build mode.** No plan mode há `PendingPlan.steps`. No build mode o agente executa sem declarar tarefas/objetivos/critérios ao usuário.
5. **Ordem Lovable pode quebrar silenciosamente.** `AssistantTurn` já tem a ordem certa, mas `invariants.ts` não garante que narração só apareça depois do thinking congelado, nem trata edge cases (erro + mini-card + closing simultâneo).
6. **Front descarta `assistant_text`.** O reducer de `agent-progress.ts` separa `opening`/`narration` de `streamText`, mas a lógica de `mapAssistantTurn` + `turn-display.ts` as vezes suprime a narração quando há tool calls.

---

## 2. Princípios do turno assistant

A ordem DOM é imutável:

```
[1] Pensando… / Pensou por Xs
[2] Narração LLM (abertura do turno)
[3] Mini-card do job (widget de estado)
[4] Fechamento LLM (resumo / wrap-up)
```

Regras:
- **Pensamento** fica só no inspector. No chat aparece apenas a linha de estado "Pensando…" / "Pensou por Xs".
- **Narração** é a primeira prosa do LLM visível no chat. Ela deve existir antes do mini-card. Se o LLM não enviar texto, o runtime chama o LLM novamente com instrução explícita para emitir a abertura — zero fallback hardcoded.
- **Mini-card** é um widget de estado do job: uma linha viva rotativa + checklist de tarefas atômicas quando existirem. Nunca uma lista de tools.
- **Fechamento** é a última prosa do LLM. Deve existir sempre, mesmo em falha, timeout, loop ou cancelamento. Se o LLM não gerar fechamento, o runtime chama o LLM novamente com instrução explícita — zero fallback hardcoded.
- **Em run ativa**, o fechamento é suprimido até o job terminar; mini-card fica visível.
- **Em run finalizada**, mini-card persiste se houve trabalho real (arquivos, comandos, plano); fechamento aparece abaixo.

---

## 3. Comportamento do mini-card

### 3.1. Uma linha viva

O mini-card mostra **uma única linha** que representa o estado atual do job. Exemplos:

| Situação real do job | Linha viva no chat |
|---|---|
| Agent está pensando, sem tool ativa | "Analisando como implementar…" |
| Editando `App.tsx` | "Editando App.tsx…" |
| Executando `npm run build` | "Executando npm run build…" |
| Lendo `src/routes/index.tsx` | "Lendo src/routes/index.tsx…" |
| Build falhou no typecheck | "Corrigindo erros de TypeScript…" |
| Tarefa atômica ativa: "Implementar tabela" | "◐ Implementar tabela de cotações" |
| Job terminou, 3 arquivos alterados | "☑ 3 arquivos alterados" |

A linha é derivada da **timeline canônica** (`ForgeTimelineItem`) e do **estado do progresso** (`AgentProgress`), nunca da lista crua de `tools`.

### 3.2. Checklist de tarefas atômicas

Quando há tarefas atômicas declaradas (plan mode ou build mode), o mini-card mostra:

- **Linha viva = tarefa ativa** (com spinner)
- **Checklist = todas as tarefas declaradas pelo LLM**
- **Colapso:** por padrão mostra as 4 primeiras; botão "Ver mais" expande o restante.

Cada tarefa tem: `id`, `label`, `status` (`pending` | `active` | `done` | `failed`), `criteria?`.

### 3.3. Estados do widget

- `thinking` — ainda só pensando, nenhum tool/tarefa começou.
- `working` — há tool/tarefa ativa.
- `done` — job terminou com sucesso.
- `failed` — job falhou, timeout, cancelado.

### 3.4. Ações (chips)

Chips só aparecem quando o job terminou e há ação útil:
- "Show diff" — se houve alterações.
- "Show file" — se último tool foi `fs_read`/`fs_write`/`fs_edit`.
- "Show output" — se último tool foi `shell_exec`.
- "Show preview" — se houve alterações e preview disponível.

---

## 4. Tarefas atômicas

### 4.1. Plan mode

Tarefas vêm automaticamente de `PendingPlan.steps`. Cada `PlanStep` vira uma tarefa:

```ts
{
  id: step.id,
  label: step.description,
  status: derivado do progresso
}
```

### 4.2. Build mode

O agente declara tarefas atômicas usando a tool call `declare_tasks`. O LLM é instruído a chamá-la no início do modo Build, antes de executar qualquer ferramenta de mutação. Cada tarefa pode incluir critério de sucesso.

Evento `task`:

```ts
{
  type: "task",
  data: {
    id: string;           // id estável
    label: string;        // descrição humana
    criteria?: string;    // critério de sucesso (opcional)
    active?: boolean;     // true se é a tarefa atual
    done?: boolean;       // true se concluída
    failed?: boolean;     // true se falhou
  }
}
```

O `RuntimeEmitter` mapeia `task` → `TASK` na timeline canônica.

### 4.3. Critério de sucesso

Quando uma tarefa tem `criteria`, ele é exibido como subtítulo da tarefa no mini-card:
- Label: "Implementar tabela de cotações"
- Criteria: "Critério: dados aparecem ordenados e paginados"

---

## 5. Narração e fechamento robustos

### 5.1. Abertura obrigatória via LLM

Antes de qualquer trabalho real (tool calls, execução, build), o runtime deve garantir que um `assistant_text` com `opening: true` foi emitido.

Se o LLM retornar sem texto de abertura (tool calls direto, ou texto vazio), o runtime NÃO usa fallback hardcoded. Em vez disso, insere uma mensagem de sistema instruindo o LLM a emitir uma breve frase de abertura para o usuário, e chama o LLM novamente:

```
Você precisa começar respondendo ao usuário com UMA frase curta (máximo 140 caracteres) explicando o que vai fazer, antes de usar ferramentas. Não use templates genéricos como "Entendi:". Seja específico ao pedido.
```

O loop continua até que um `assistant_text` com `opening: true` e texto não vazio seja emitido, ou até 2 retries. Se esgotar, o job falha com uma mensagem de erro técnica honesta: "O modelo não respondeu com a mensagem esperada." — não é fallback de abertura, é erro de infraestrutura.

### 5.2. Fechamento obrigatório via LLM

Todo caminho de saída de `execute.ts`, `plan-turn.ts` e `chat-turn.ts` deve terminar com um `assistant_text` final visível (`final: true` ou sem `thinking`/`narration`/`opening`).

Se a síntese final (`resolveClosureText`) retornar vazio ou o LLM não gerar fechamento, o runtime NÃO usa fallback hardcoded. Em vez disso, insere uma mensagem de sistema instruindo o LLM a emitir uma frase de fechamento honesta para o usuário, e chama o LLM novamente:

```
Você deve terminar esta interação com uma frase curta para o usuário (máximo 200 caracteres) explicando o resultado real: o que conseguiu, o que falhou, ou por que parou. Não invente sucesso. Seja específico.
```

Se mesmo assim o LLM não gerar texto após 2 retries, o job falha com uma mensagem de erro técnica honesta: "O modelo não respondeu com a mensagem esperada." — não é fallback de fechamento, é erro de infraestrutura.

### 5.3. Front nunca descarta `assistant_text`

O reducer `agent-progress.ts` deve preservar `assistant_text` como `streamText` quando for fechamento final (`final: true`), mesmo que venha após narração. O `resolveClosingProse` deve evitar duplicar narração, mas não pode eliminar o fechamento.

---

## 6. Componentes afetados

### Backend (edge function)

- `packages/agent-contract/src/events.ts` — adicionar `task` ao contrato.
- `supabase/functions/agent-run/runtime/emitter.ts` — mapear `task` para timeline.
- `supabase/functions/agent-run/runtime/phases/narration.ts` — garantir `ensureOpeningBeforeWork` nos momentos certos.
- `supabase/functions/agent-run/runtime/phases/execute.ts` — abertura obrigatória, fechamento obrigatório, emitir `task` no build mode.
- `supabase/functions/agent-run/runtime/phases/plan-turn.ts` — abertura obrigatória, fechamento obrigatório.
- `supabase/functions/agent-run/runtime/phases/chat-turn.ts` — fechamento obrigatório em falhas.
- `supabase/functions/agent-run/runtime/phases/snapshot.ts` — persistir tasks no snapshot.
- `supabase/functions/agent-run/_events.ts` — sincronizar contrato (via `npm run sync:agent-contract`).

### Frontend

- `src/lib/agent-progress.ts` — handler para `task`, garantir que `assistant_text` final vire `streamText`.
- `src/lib/timeline-builder.ts` — mapear `task` → `TASK`.
- `src/lib/forge-run.ts` — `collectMiniCardLiveLine` (uma linha viva), simplificar `collectMiniCardActivity`, adicionar `tasks` com critérios.
- `src/lib/chat/turn.ts` — garantir mini-card com linha viva + checklist.
- `src/components/chat/ChatJobCard.tsx` — renderizar uma linha viva + checklist, remover dump de 5 activity lines.
- `src/lib/chat/invariants.ts` — reforçar ordem Lovable e suprimir fechamento durante run ativa.
- `src/lib/chat/turn-display.ts` — garantir que narração não seja suprimida.

### Testes

- `src/lib/chat/assistant-turn-order.test.ts` — ordem DOM.
- `src/lib/chat/invariants.test.ts` — invariantes em run ativa e finalizada.
- `src/lib/chat/turn-job-card.test.ts` — mini-card com linha viva e checklist.
- `src/lib/forge-run.test.ts` — `collectMiniCardLiveLine` e tasks.
- `src/lib/timeline-builder.test.ts` — evento `task` na timeline.
- `supabase/functions/agent-run/runtime/phases/narration.test.ts` — abertura obrigatória.
- `supabase/functions/agent-run/runtime/phases/execute.test.ts` — fechamento em caminhos de erro.

---

## 7. Validação

- `npm run typecheck` passa.
- `npm run build` passa.
- `npm run test` (front) passa.
- `npm run sync:agent-contract` + edge function typecheck passa.
- `npx supabase functions deploy agent-run` deployado.
- `git push origin main` para Vercel buildar.

---

## 8. Decisões pendentes do usuário

1. **Tarefas atômicas no build mode:** prefere (A) LLM declarar via tool call `declare_tasks`, ou (B) runtime inferir do `step_intent`/`task_phase`? Recomendo (A) para critérios de sucesso explícitos.
2. **Fallback de abertura:** os textos propostos em 5.1 estão aceitáveis? Quer algo mais específico por modo?
3. **Checklist no mini-card:** mostrar todas as tarefas ou só as próximas 4-5? Recomendo próximas 4 + contador "+3".
