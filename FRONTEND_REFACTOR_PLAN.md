# Plano de Refatoração FORGE 2.0 — Frontend UX/UI

## Diagnóstico Visual: FORGE vs Lovable.dev

### O que o Lovable.dev faz (referência das imagens):

**Chat (esquerda) — Comunicação humana:**
```
┌─ Chat ─────────────────────────────┐
│                                    │
│  [User] Crie uma landing page      │
│                                    │
│  Thought for 4s                    │  ← "Thinking" com timer
│                                    │
│  Vou investigar o estado atual...  │  ← Narração em PT-BR
│                                    │
│  ┌─ Mini Card ──────────────────┐   │
│  │ Edited  index.ts            │   │  ← Título da tarefa
│  │ Configuring Lara workspace  │   │
│  │                             │   │
│  │ ☑ Higienizar Dockerfile     │   │  ← Lista atômica
│  │ ☑ Conectar rota browser     │   │
│  │ ☑ Proteção anti-destrutivo  │   │
│  │ ○ Auto-save de scripts      │   │  ← Ativo (spinner)
│  │ ○ Regenerar bundles         │   │  ← Pendente
│  │                             │   │
│  │ Timeline completa →          │   │  ← Link para inspector
│  └─────────────────────────────┘   │
│                                    │
│  [Queue follow-up...]  [Build ▼]  │  ← Input minimalista
│                                    │
└────────────────────────────────────┘
```

**Preview/Inspector (direita) — Máquina:**
```
┌─ Preview ──────────────────────────┐
│ [Timeline] [Changes]               │  ← Tabs
│                                    │
│  TASK                              │
│  Retomando do passo 20/20          │
│                                    │
│  TASK                              │
│  Checkpoint: 57 mensagens          │
│                                    │
│  TASK                              │
│  Avaliar o escopo da tarefa       │
│                                    │
│  RESULT                            │
│  Checkpoint salvo                 │
│                                    │
│  ▼ Thought for 28s                  │  ← Colapsável
│    O deploy faz git pull + up...   │
│                                    │
│  ▼ Edited  index.ts               │  ← Colapsável
│    cd supabase/functions && ...    │
│                                    │
└────────────────────────────────────┘
```

### O que o FORGE faz (atual — errado):

**Chat (esquerda) — Poluído:**
```
┌─ Chat ─────────────────────────────┐
│                                    │
│  [User] Crie uma landing page      │
│                                    │
│  FORGE                             │
│  ┌─ Mini Card ──────────────────┐   │
│  │ Working...                   │   │
│  │ Trabalhando no projeto...    │   │
│  └─────────────────────────────┘   │
│                                    │
│  ┌─ Timeline ──────────────────┐   │  ← ❌ ERRADO: timeline no chat
│  │ ● Analisando projeto        │   │
│  │ ○ Gerando código            │   │
│  │ ○ Verificando build         │   │
│  └─────────────────────────────┘   │
│                                    │
│  ┌─ Plano ────────────────────┐   │  ← ❌ ERRADO: plano no chat
│  │ Plano proposto              │   │
│  │ Missão: Criar landing page  │   │
│  │ [Aprovar] [Rejeitar]        │   │
│  └─────────────────────────────┘   │
│                                    │
│  ┌─ Diffs ────────────────────┐   │  ← ❌ ERRADO: diffs no chat
│  │ src/App.tsx                 │   │
│  │ - <div>Hello</div>          │   │
│  │ + <div>Hello World</div>    │   │
│  └─────────────────────────────┘   │
│                                    │
│  Resposta do agente aqui...        │
│                                    │
│  [Copiar] [Desfazer]               │
│                                    │
└────────────────────────────────────┘
```

---

## Princípios da Refatoração

### 1. Separação de Responsabilidades

| Onde | O que aparece | O que NÃO aparece |
|------|---------------|-------------------|
| **Chat** | Narração, tarefas atômicas, status, erros | Timeline, diffs, plano detalhado, tool outputs |
| **Preview/Inspector** | Timeline sequencial, changes, plano, tool outputs | Narração, tarefas atômicas |

### 2. Hierarquia de Informação

```
Chat (alto nível)          Preview (baixo nível)
    │                            │
    ▼                            ▼
"Vou criar uma landing"    TASK: fs_write App.tsx
    │                            │
"Passo 1/5: Hero"          TOOL: shell_exec npm build
    │                            │
"Build falhou, corrigindo" RESULT: Build falhou
    │                            │
"Pronto! 8 arquivos"       CHANGES: 8 arquivos
```

### 3. Estados Visuais Claros

| Estado | Chat mostra | Preview mostra |
|--------|-------------|------------------|
| **Thinking** | "Thought for Xs" + ícone pulso | Nada (ainda não há ação) |
| **Working** | Mini card + tarefas atômicas | Timeline com TASKs ativas |
| **Tool** | "Editando App.tsx..." | TOOL detalhado (colapsável) |
| **Done** | "Done" bubble + resumo | RESULT + CHANGES |
| **Failed** | Erro amigável | Erro técnico + stack |
| **Plan** | "Plano proposto — clique para ver" | Plano completo + ações |

---

## Especificação de Componentes

### A. Chat — `ForgeChat.tsx` (novo)

**Responsabilidade:** Comunicação humana. Nada técnico.

```tsx
interface ForgeChatProps {
  messages: ChatMessage[];
  activeRun: AgentRun | null;
  pendingPlan: PendingPlan | null;
  onSend: (text: string) => void;
  onPlanAction: (action: "approve" | "reject" | "edit") => void;
}

// Estrutura:
// 1. MessageList — mensagens user/assistant
// 2. ActiveRunCard — mini card da run ativa (se houver)
// 3. InputArea — textarea + botões
```

**Regras:**
- NUNCA renderiza `AgentTimeline`
- NUNCA renderiza `ChatDiffViewer`
- NUNCA renderiza `PlanDocumentView` (só link "Ver plano →")
- SEMPRE mostra `AgentJobMiniCard` para runs ativas
- SEMPRE mostra "Thought for Xs" quando thinking

### B. Mini Card — `AgentJobMiniCard.tsx` (refatorar)

**Responsabilidade:** Resumo visual da run ativa.

```tsx
interface AgentJobMiniCardProps {
  title: string;           // "Configuring Lara workspace"
  status: "thinking" | "working" | "done" | "failed";
  tasks: TaskItem[];       // Lista atômica
  currentTaskIndex: number;
  onOpenInspector: () => void;
}

// Estrutura:
// ┌─ Mini Card ──────────────────┐
// │ [🔵] Working...              │  ← Status badge
// │ Configuring Lara workspace   │  ← Título
// │                              │
// │ ☑ Higienizar Dockerfile      │  ← Done
// │ ☑ Conectar rota browser      │  ← Done
// │ ◐ Auto-save de scripts       │  ← Active (spinner)
// │ ○ Regenerar bundles          │  ← Pending
// │                              │
// │ Timeline completa →          │  ← Link
// └─────────────────────────────┘
```

**Regras:**
- Máximo 6 tarefas visíveis
- Cada tarefa: ícone + label + status
- Status: `done` (✓ verde), `active` (◐ spinner), `pending` (○ cinza), `failed` (✗ vermelho)
- Clique abre inspector no preview

### C. Inspector — `JobInspector.tsx` (novo)

**Responsabilidade:** Visualização técnica detalhada.

```tsx
interface JobInspectorProps {
  run: AgentRun;
  activeTab: "timeline" | "changes" | "plan";
  onTabChange: (tab: string) => void;
}

// Tabs:
// ┌─ [Timeline] [Changes] [Plan] ─┐
// │                                 │
// │  TASK                           │
//  │  Retomando do passo 20/20     │
//  │                               │
//  │  THOUGHT ▼                    │  ← Colapsável
//  │  Thought for 28s              │
//  │  O deploy faz git pull...     │
//  │                               │
//  │  TOOL ▼                       │  ← Colapsável
//  │  shell_exec                   │
//  │  cd supabase/functions && ... │
//  │                               │
//  │  RESULT                       │
//  │  Checkpoint salvo             │
//  │                               │
//  └───────────────────────────────┘
```

**Regras:**
- Timeline: sequencial, cronológica, não agrupada
- Cada item tem tipo (TASK, THOUGHT, TOOL, RESULT)
- THOUGHT e TOOL são colapsáveis (default: collapsed)
- RESULT sempre visível
- Changes: lista de arquivos + diffs (colapsáveis)
- Plan: documento completo + botões Aprovar/Rejeitar/Editar

### D. Input Area — `ChatInput.tsx` (refatorar)

**Responsabilidade:** Entrada de mensagens.

```tsx
// Estrutura:
// ┌─ Input ────────────────────────┐
// │ [Queue follow-up...]         │  ← Placeholder quando running
// │                                │
// │ [+] [Visual edits] [Build ▼]  │  ← Botões
// │ [🎤] [⬆]                      │  ← Mic + Send
// └───────────────────────────────┘
```

**Regras:**
- Placeholder muda: "Descreva o que quer construir..." (idle) / "Queue follow-up..." (running)
- Botão "Build" dropdown: plan/build/chat
- Anexos: ícone + drag-drop
- Auto-save: sessionStorage

---

## Design System — Tokens

### Cores

```css
/* Status */
--status-thinking: #f59e0b;    /* Âmbar */
--status-working: #3b82f6;     /* Azul */
--status-done: #10b981;        /* Verde */
--status-failed: #ef4444;      /* Vermelho */
--status-pending: #6b7280;     /* Cinza */

/* Fundo */
--bg-chat: #0a0a0f;            /* Quase preto */
--bg-card: #13131f;            /* Card */
--bg-hover: #1a1a2e;           /* Hover */
--bg-input: #1e1e2e;           /* Input */

/* Texto */
--text-primary: #e2e8f0;       /* Principal */
--text-secondary: #94a3b8;     /* Secundário */
--text-muted: #64748b;         /* Muted */
--text-accent: #fbbf24;        /* Destaque (FORGE) */

/* Borda */
--border: #27273a;             /* Sutil */
--border-active: #3b82f6;      /* Ativa */
```

### Tipografia

```css
/* Chat */
--font-chat: 14px/1.6 "Inter", system-ui;
--font-narration: 14px/1.6 "Inter", system-ui;  /* Itálico, cinza */
--font-thought: 12px/1.4 "JetBrains Mono", monospace;  /* Timer */

/* Mini Card */
--font-card-title: 13px/1.4 "Inter", system-ui;  /* Semi-bold */
--font-task: 12px/1.4 "Inter", system-ui;         /* Regular */

/* Inspector */
--font-task-label: 11px/1.2 "JetBrains Mono", monospace;  /* Uppercase */
--font-task-body: 13px/1.5 "Inter", system-ui;
--font-tool: 12px/1.4 "JetBrains Mono", monospace;
```

### Espaçamento

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;

/* Chat */
--chat-padding: 16px;
--message-gap: 12px;
--card-padding: 12px;

/* Inspector */
--inspector-padding: 16px;
--item-gap: 8px;
--item-padding: 10px 12px;
```

### Animações

```css
/* Thinking pulse */
@keyframes thinking-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Task check */
@keyframes task-check {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* Card appear */
@keyframes card-appear {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

---

## Fluxo de Estados Visuais

### 1. Usuário envia mensagem

```
Chat:
  [User] "Crie uma landing page"
  
  [Input] Placeholder: "Queue follow-up..." (disabled)
  
Preview:
  [Status] "Agent working — clique o job no chat"
```

### 2. Agente começa a pensar

```
Chat:
  [User] "Crie uma landing page"
  
  💡 Thought for 2s
  
  [Input] Placeholder: "Queue follow-up..."
  
Preview:
  [Status] "Agent working — clique o job no chat"
```

### 3. Agente propõe plano

```
Chat:
  [User] "Crie uma landing page"
  
  💡 Thought for 5s
  
  "Vou criar uma landing page com Hero, Features e CTA."
  
  ┌─ Mini Card ──────────────────┐
  │ [🔵] Working...              │
  │ Criando landing page          │
  │                              │
  │ ○ Criar Hero section         │
  │ ○ Criar Features section     │
  │ ○ Criar CTA section          │
  │ ○ Configurar rotas           │
  │ ○ Verificar build            │
  │                              │
  │ Ver plano no inspector →     │
  └─────────────────────────────┘
  
  [Input] Placeholder: "Queue follow-up..."

Preview:
  [Tab: Plan]
  
  Plano FORGE
  
  Missão: Criar landing page
  
  1. Criar Hero section
  2. Criar Features section
  3. Criar CTA section
  4. Configurar rotas
  5. Verificar build
  
  [Editar] [Rejeitar] [Aprovar e construir]
```

### 4. Usuário aprova plano

```
Chat:
  [User] "Crie uma landing page"
  
  💡 Thought for 5s
  
  "Vou criar uma landing page com Hero, Features e CTA."
  
  ┌─ Mini Card ──────────────────┐
  │ [🔵] Working...              │
  │ Criando landing page          │
  │                              │
  │ ☑ Criar Hero section         │  ← Done
  │ ◐ Criar Features section     │  ← Active
  │ ○ Criar CTA section          │  ← Pending
  │ ○ Configurar rotas           │
  │ ○ Verificar build            │
  │                              │
  │ Timeline completa →          │
  └─────────────────────────────┘
  
  [Input] Placeholder: "Queue follow-up..."

Preview:
  [Tab: Timeline]
  
  TASK
  Criar Hero section
  
  TOOL ▼
  fs_write  src/components/Hero.tsx
  
  RESULT
  Hero section criado
  
  TASK
  Criar Features section
  
  THOUGHT ▼
  Thought for 3s
  Vou usar grid de 3 colunas...
```

### 5. Agente termina

```
Chat:
  [User] "Crie uma landing page"
  
  💡 Thought for 5s
  
  "Vou criar uma landing page com Hero, Features e CTA."
  
  ┌─ Mini Card ──────────────────┐
  │ [🟢] Done                    │
  │ Landing page criada           │
  │                              │
  │ ☑ Criar Hero section         │
  │ ☑ Criar Features section     │
  │ ☑ Criar CTA section          │
  │ ☑ Configurar rotas           │
  │ ☑ Verificar build            │
  │                              │
  │ 8 arquivos alterados →       │
  └─────────────────────────────┘
  
  "Pronto! Criei 8 arquivos. O build passou."
  
  [Done]
  
  [Input] Placeholder: "Descreva o que quer construir..."

Preview:
  [Tab: Changes]
  
  8 arquivos alterados
  
  ▼ src/components/Hero.tsx
  + export function Hero() {...}
  
  ▼ src/components/Features.tsx
  + export function Features() {...}
  
  ▼ src/components/CTA.tsx
  + export function CTA() {...}
  
  ▼ src/App.tsx
  - import { Home } from "./pages/Home";
  + import { Hero } from "./components/Hero";
  + import { Features } from "./components/Features";
  + import { CTA } from "./components/CTA";
```

---

## Componentes a Refatorar/Criar

### Novos Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|------------------|
| `ForgeChat` | `src/components/editor/ForgeChat.tsx` | Container do chat (mensagens + input) |
| `ForgeMessage` | `src/components/editor/ForgeMessage.tsx` | Mensagem individual (user/assistant/system) |
| `ForgeThinking` | `src/components/editor/ForgeThinking.tsx` | "Thought for Xs" com timer |
| `ForgeNarration` | `src/components/editor/ForgeNarration.tsx` | Texto de narração do agente |
| `ForgeMiniCard` | `src/components/editor/ForgeMiniCard.tsx` | Card da run ativa (título + tarefas) |
| `ForgeTaskList` | `src/components/editor/ForgeTaskList.tsx` | Lista atômica de tarefas |
| `ForgeTaskItem` | `src/components/editor/ForgeTaskItem.tsx` | Item individual da tarefa |
| `ForgeDoneBubble` | `src/components/editor/ForgeDoneBubble.tsx` | Badge "Done" |
| `ForgeErrorCard` | `src/components/editor/ForgeErrorCard.tsx` | Card de erro amigável |
| `JobInspector` | `src/components/editor/JobInspector.tsx` | Container do inspector |
| `InspectorTimeline` | `src/components/editor/InspectorTimeline.tsx` | Tab Timeline |
| `InspectorChanges` | `src/components/editor/InspectorChanges.tsx` | Tab Changes |
| `InspectorPlan` | `src/components/editor/InspectorPlan.tsx` | Tab Plan |
| `TimelineItem` | `src/components/editor/TimelineItem.tsx` | Item da timeline (TASK/THOUGHT/TOOL/RESULT) |
| `TimelineTask` | `src/components/editor/TimelineTask.tsx` | TASK na timeline |
| `TimelineThought` | `src/components/editor/TimelineThought.tsx` | THOUGHT na timeline (colapsável) |
| `TimelineTool` | `src/components/editor/TimelineTool.tsx` | TOOL na timeline (colapsável) |
| `TimelineResult` | `src/components/editor/TimelineResult.tsx` | RESULT na timeline |
| `ChatInputV2` | `src/components/editor/ChatInputV2.tsx` | Input minimalista |

### Componentes a REMOVER do Chat

| Componente | Motivo |
|------------|--------|
| `AgentTimeline` | Timeline vai para o inspector |
| `ChatDiffViewer` | Diffs vão para o inspector |
| `PlanViewer` (no chat) | Plano vai para o inspector |
| `AgentActivityCard` | Substituído por `ForgeMiniCard` |
| `TurnReceipt` | Não necessário (info no mini card) |
| `AgentStepBar` | Substituído por lista atômica |

### Componentes a MANTER (com ajustes)

| Componente | Ajuste |
|------------|--------|
| `EditorResizableLayout` | Manter estrutura chat/preview |
| `PreviewFrame` | Manter (iframe do preview) |
| `CodeEditor` | Manter (editor de código) |
| `FileTree` | Manter (árvore de arquivos) |
| `CommandPalette` | Manter |
| `LogPanel` | Manter (logs técnicos) |

---

## API de Dados — O que o Backend precisa emitir

### Eventos SSE (Server-Sent Events)

```typescript
// Evento: thinking
{
  type: "thinking",
  data: {
    durationMs: 4000,  // Quando termina, envia duração
    text: "Vou investigar o estado atual..."
  }
}

// Evento: narration
{
  type: "narration",
  data: {
    text: "Vou criar uma landing page com Hero, Features e CTA."
  }
}

// Evento: task_list
{
  type: "task_list",
  data: {
    title: "Criando landing page",
    tasks: [
      { id: "1", label: "Criar Hero section", status: "done" },
      { id: "2", label: "Criar Features section", status: "active" },
      { id: "3", label: "Criar CTA section", status: "pending" },
    ]
  }
}

// Evento: task_update
{
  type: "task_update",
  data: {
    taskId: "2",
    status: "done"
  }
}

// Evento: plan_proposed
{
  type: "plan_proposed",
  data: {
    planId: "...",
    title: "Landing page",
    tasks: [...]
  }
}

// Evento: timeline (para o inspector)
{
  type: "timeline",
  data: {
    items: [
      { type: "TASK", label: "Criar Hero section" },
      { type: "THOUGHT", durationMs: 3000, text: "Vou usar grid..." },
      { type: "TOOL", name: "fs_write", path: "src/components/Hero.tsx" },
      { type: "RESULT", ok: true, text: "Hero section criado" }
    ]
  }
}

// Evento: file_diff (para o inspector)
{
  type: "file_diff",
  data: {
    path: "src/components/Hero.tsx",
    before: "",
    after: "export function Hero() {...}"
  }
}

// Evento: done
{
  type: "done",
  data: {
    ok: true,
    summary: "Landing page criada com 8 arquivos.",
    fileCount: 8
  }
}

// Evento: error
{
  type: "error",
  data: {
    message: "Build falhou",
    recoverable: true
  }
}
```

---

## Plano de Implementação (4 semanas)

### Semana 1: Fundação — Design System + Chat

**Dia 1-2: Design System**
- [ ] Criar `src/styles/forge-tokens.css` (cores, tipografia, espaçamento)
- [ ] Criar `src/styles/forge-animations.css` (keyframes)
- [ ] Atualizar `tailwind.config.ts` com tokens customizados

**Dia 3-4: Componentes Base do Chat**
- [ ] `ForgeThinking` — "Thought for Xs" com timer
- [ ] `ForgeNarration` — Texto de narração
- [ ] `ForgeDoneBubble` — Badge "Done"
- [ ] `ForgeErrorCard` — Card de erro

**Dia 5: Mini Card**
- [ ] `ForgeTaskItem` — Item da tarefa (ícone + label + status)
- [ ] `ForgeTaskList` — Lista atômica
- [ ] `ForgeMiniCard` — Card completo (título + tasks + link)

### Semana 2: Chat Completo + Input

**Dia 1-2: Chat Container**
- [ ] `ForgeMessage` — Mensagem individual
- [ ] `ForgeChat` — Container (mensagens + mini card + input)
- [ ] Integrar com `ChatStream` existente (ou substituir)

**Dia 3-4: Input V2**
- [ ] `ChatInputV2` — Input minimalista
- [ ] Placeholder dinâmico (idle/running)
- [ ] Botão "Build" dropdown
- [ ] Auto-save sessionStorage

**Dia 5: Integração**
- [ ] Substituir `ChatInput` atual por `ForgeChat` + `ChatInputV2`
- [ ] Remover `AgentTimeline`, `ChatDiffViewer`, `PlanViewer` do chat
- [ ] Testar fluxo completo

### Semana 3: Inspector

**Dia 1-2: Timeline**
- [ ] `TimelineTask` — TASK na timeline
- [ ] `TimelineThought` — THOUGHT colapsável
- [ ] `TimelineTool` — TOOL colapsável
- [ ] `TimelineResult` — RESULT
- [ ] `TimelineItem` — Container genérico

**Dia 3: Tabs**
- [ ] `InspectorTimeline` — Tab Timeline
- [ ] `InspectorChanges` — Tab Changes (diffs)
- [ ] `InspectorPlan` — Tab Plan (com ações)

**Dia 4-5: Inspector Container**
- [ ] `JobInspector` — Container com tabs
- [ ] Integrar com `JobWorkspacePanel` existente
- [ ] Substituir `JobInlineTimeline` por nova timeline

### Semana 4: Integração + Polish

**Dia 1-2: Integração Chat ↔ Preview**
- [ ] Clique no mini card abre inspector
- [ ] Clique em "Ver plano" abre plan tab
- [ ] Preview sync durante build (já implementado)

**Dia 3-4: Animações + Polish**
- [ ] Animações de entrada (card-appear, task-check)
- [ ] Transições de estado (thinking → working → done)
- [ ] Scroll automático inteligente
- [ ] Responsividade mobile

**Dia 5: Testes + Ajustes**
- [ ] Testar todos os estados (thinking, working, plan, done, error)
- [ ] Ajustar cores, espaçamento, tipografia
- [ ] Feedback do usuário

---

## Checklist de Aceitação

### Chat
- [ ] NUNCA mostra timeline
- [ ] NUNCA mostra diffs
- [ ] NUNCA mostra plano detalhado (só link)
- [ ] SEMPRE mostra "Thought for Xs" quando thinking
- [ ] SEMPRE mostra narração em português
- [ ] SEMPRE mostra mini card com tarefas atômicas
- [ ] Tarefas têm ícones claros (done/active/pending/failed)
- [ ] Input muda placeholder quando running
- [ ] Auto-save funciona

### Inspector
- [ ] Tabs: Timeline | Changes | Plan
- [ ] Timeline é sequencial e cronológica
- [ ] THOUGHT e TOOL são colapsáveis
- [ ] RESULT sempre visível
- [ ] Changes mostra arquivos + diffs
- [ ] Plan mostra documento + botões Aprovar/Rejeitar/Editar
- [ ] Abre automaticamente quando clica no mini card

### Design
- [ ] Cores consistentes com tokens
- [ ] Tipografia legível (Inter + JetBrains Mono)
- [ ] Espaçamento generoso
- [ ] Animações sutis (não intrusivas)
- [ ] Estados claros (thinking/working/done/failed)
- [ ] Mobile-friendly

---

## Conclusão

Esta refatoração transforma o FORGE de um **chat poluído** para uma **experiência conversacional limpa**, separando:

- **Comunicação humana** (chat) — narração, tarefas, status
- **Detalhes técnicos** (inspector) — timeline, changes, plano

O resultado é uma interface que:
1. **Não assusta** usuários novos (chat limpo)
2. **Não esconde** detalhes técnicos (inspector completo)
3. **Comunica claramente** o que o agente está fazendo (tarefas atômicas)
4. **Permite interação** durante execução (fila, plano no inspector)
5. **Sobrevive** a reloads (sessionStorage)
6. **Surpreende** pela qualidade do design

**Referência visual:** Lovable.dev — minimalista, clara, profissional.
**Diferencial FORGE:** Tarefas atômicas no chat + inspector rico no preview.
