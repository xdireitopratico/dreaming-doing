# Arquitetura FORGE 2.0 — Blueprint de Reconstrução

## Diagnóstico: Por Que a Arquitetura Atual Gera Caos

### 1. O Problema das "Requisições Fantasmas"

O frontend faz **polling agressivo** e **subscrições realtime** que nunca morrem:

```
useAgentRun.ts          → subscribe postgres_changes (a cada run)
useAgentSessionCoordinator.ts → subscribe agent_runs INSERT/UPDATE
useEditorAgentOrchestration.ts → syncPreviewToSandbox debounce
usePreviewBoot.ts       → health check interval
ChatInput.tsx           → pendingQueue refresh
```

Cada um desses hooks roda **independentemente**. Quando o componente desmonta (usuário navega para outra página), os canais do Supabase **não são sempre limpos**. O `useEffect` cleanup pode falhar se o componente crashar. Resultado: **dezenas de canais realtime abertos**, cada um fazendo polling a cada 12 segundos (`stalePollRef`), gerando milhares de requisições.

### 2. O Problema da "Lógica Caótica no Agente"

O `loop.ts` tem **1.800+ linhas** e faz tudo:
- Classificação
- Planejamento
- Execução de tools
- Observação de build
- Compressão de contexto
- Checkpoint/resume
- Narração
- Git commits
- Type checking
- Rollback

Cada fase é um `if/else` gigante. Quando algo quebra, é impossível saber em qual fase. O loop não tem **máquina de estados explícita** — o estado é implícito em variáveis como `this.state.phase`, `buildAttempts`, `isExecutionStuck`.

### 3. O Problema do "Ninguém Entrega Nada"

O agente **nunca termina** de forma confiável porque:
- O loop pode ficar preso em retry infinito
- O observer pode falhar silenciosamente
- O checkpoint pode corromper o estado
- O rollback pode deixar o git em estado inconsistente
- O frontend pode perder o `finish` evento e achar que ainda está rodando

Não há **contrato de entrega** — ninguém garante que o que foi prometido foi realmente feito.

---

## Princípios da Arquitetura Nova

1. **Uma fonte de verdade por domínio**
   - Estado do agente → banco de dados (não memória React)
   - Estado do chat → banco de dados
   - Estado do preview → banco de dados
   - O frontend é **read-only** com otimistic updates

2. **Máquina de estados explícita**
   - O agente é uma FSM (Finite State Machine)
   - Cada transição é logada e reversível
   - Não há `if/else` aninhado — há `estado → evento → próximo estado`

3. **Cada camada faz uma coisa só**
   - Router: só classifica
   - Planner: só planeja
   - Executor: só executa tools
   - Observer: só observa
   - Narrator: só narra
   - Cada um é um **worker Inngest separado**

4. **Requisições sob controle**
   - Zero polling no frontend
   - Um único canal realtime por sessão
   - Backend push (SSE/WebSocket) em vez de pull
   - Rate limiting por usuário, por projeto, por IP

5. **Contrato de entrega**
   - Cada run produz um **artifact** (lista de arquivos modificados + hash)
   - O artifact é verificado antes de marcar como "done"
   - Se a verificação falha, o run é "failed", não "done com erros"

---

## Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTE (React)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   ChatView   │  │ PreviewView  │  │  PlanView    │  │  DiffView    │      │
│  │  (read-only) │  │  (read-only) │  │  (read-only) │  │  (read-only) │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                 │             │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴──────┐      │
│  │                    TanStack Query (cache)                          │      │
│  │         Uma query por domínio: messages, runs, preview           │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│         │                                                                    │
│  ┌──────┴────────────────────────────────────────────────────────────┐      │
│  │              Zustand Store (UI state only)                        │      │
│  │   draftText, sidebarOpen, theme, selectedFile — nada de negócio  │      │
│  └───────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 1 canal SSE
                                      │ (não 5 canais realtime)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (Edge)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  /chat/send  │  │ /plan/approve│  │ /run/cancel  │  │ /preview/sync│      │
│  │  (mutação)   │  │  (mutação)   │  │  (mutação)   │  │  (mutação)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                 │             │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴──────┐      │
│  │                    Rate Limiter (Redis)                           │      │
│  │   10 req/min por user, 100 req/min por projeto                  │      │
│  └──────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORQUESTRADOR (Inngest)                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                     State Machine (FSM)                            │     │
│  │                                                                     │     │
│  │   [idle] ──send──► [classifying] ──done──► [planning]             │     │
│  │                                              │                      │     │
│  │                    ┌─────────────────────────┘                      │     │
│  │                    ▼                                                │     │
│  │              [awaiting_plan] ◄──approve──► [building]               │     │
│  │                    │                           │                   │     │
│  │                    └────────reject─────────────┘                   │     │
│  │                                                │                   │     │
│  │                    ┌─────────────────────────────┘                   │     │
│  │                    ▼                                                │     │
│  │              [observing] ──pass──► [delivering] ──done──► [done]   │     │
│  │                    │                                               │     │
│  │                    └────fail──► [fixing] ──retry──► [building]       │     │
│  │                                                                     │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Cada transição dispara um worker. O estado é persistido no DB a cada passo.│
│  Se o worker crasha, Inngest retoma do último estado persistido.              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORKERS (Inngest Steps)                              │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Classifier │  │   Planner   │  │   Builder   │  │   Observer  │       │
│  │   Worker    │  │   Worker    │  │   Worker    │  │   Worker    │       │
│  │  (1 step)   │  │  (1 step)   │  │ (N steps)   │  │  (1 step)   │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │              │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐        │
│  │                     Tool Executor (Deno)                       │        │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │        │
│  │  │ fs_read │  │fs_write │  │ fs_edit │  │shell_exec│          │        │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │        │
│  └────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Narrator (SSE Stream)                          │   │
│  │  Emite eventos de narração em tempo real para o frontend           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PERSISTÊNCIA (Supabase)                              │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  messages   │  │  agent_runs │  │  artifacts  │  │   events    │       │
│  │  (chat)     │  │  (estado)   │  │  (entrega)  │  │  (log)      │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   plans     │  │ checkpoints │  │   files     │  │   queue     │       │
│  │ (propostos) │  │  (resume)   │  │ (projeto)   │  │ (pending)   │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detalhamento por Camada

### 1. Cliente — React como "Tela", não como "Cérebro"

**Problema atual:** O React gerencia `progress`, `frozenRuns`, `activeRunId`, `lastSeq`, `pendingQueue`, `previewSyncTick` — tudo em memória. Um F5 mata tudo.

**Solução:** O React é **read-only**. Todo estado de negócio vem do banco via TanStack Query.

```typescript
// Antes: useAgentRun.ts (901 linhas, estado em memória)
const [progress, setProgress] = useState(initialAgentProgress);
const [activeRunId, setActiveRunId] = useState(null);
const [frozenRuns, setFrozenRuns] = useState(new Map());

// Depois: useAgentRun.ts (50 linhas, query do banco)
function useAgentRun(projectId: string) {
  return useQuery({
    queryKey: ["agent-run", projectId],
    queryFn: () => supabase.from("agent_runs").select("*").eq("project_id", projectId).single(),
    staleTime: 1000,
  });
}
```

**SSE único:** Um único `EventSource` por sessão, não 5 canais Supabase Realtime.

```typescript
// hooks/useAgentSSE.ts
export function useAgentSSE(projectId: string) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const es = new EventSource(`/api/agent-stream?projectId=${projectId}`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      // Invalida queries específicas, não setState
      queryClient.invalidateQueries({ queryKey: ["agent-run", projectId] });
      queryClient.invalidateQueries({ queryKey: ["messages", projectId] });
      if (event.type === "file_diff") {
        queryClient.invalidateQueries({ queryKey: ["preview", projectId] });
      }
    };
    return () => es.close();
  }, [projectId, queryClient]);
}
```

**Zustand só para UI:**
```typescript
// stores/uiStore.ts
interface UIState {
  draftText: string;        // auto-save localStorage
  sidebarOpen: boolean;
  selectedFile: string | null;
  chatCollapsed: boolean;
}
```

---

### 2. API Gateway — Edge Function como Portão

**Problema atual:** O frontend chama diretamente `supabase.functions.invoke("agent-run")`, que dispara Inngest. Não há rate limiting, não há validação de input, não há controle de concorrência.

**Solução:** Edge Function como **portão único**.

```typescript
// supabase/functions/agent-gateway/index.ts
Deno.serve(async (req) => {
  const { projectId, action, payload } = await req.json();
  
  // 1. Rate limiting (Redis/Upstash)
  const rateLimit = await checkRateLimit(req.headers.get("x-user-id"));
  if (!rateLimit.ok) return new Response("Rate limited", { status: 429 });
  
  // 2. Concorrência: só um run ativo por projeto
  const activeRun = await getActiveRun(projectId);
  if (activeRun && action !== "cancel") {
    // Enfileira em vez de rejeitar
    await enqueueMessage(projectId, payload);
    return Response.json({ queued: true, position: await queuePosition(projectId) });
  }
  
  // 3. Dispara Inngest com estado inicial
  const runId = await createRun(projectId, { status: "classifying", payload });
  await inngest.send({ name: "agent.classify", data: { runId, projectId, payload } });
  
  return Response.json({ runId, status: "classifying" });
});
```

---

### 3. Orquestrador — Máquina de Estados (FSM)

**Problema atual:** O `loop.ts` é um `while` gigante com `if/else` aninhado. Não há visibilidade de em qual fase está, não há retry granular, não há timeout por fase.

**Solução:** Cada run é uma **máquina de estados** persistida no banco.

```typescript
// lib/agent-fsm.ts
export type AgentState =
  | { name: "idle"; since: number }
  | { name: "classifying"; since: number; attempt: number }
  | { name: "planning"; since: number; classification: Classification }
  | { name: "awaiting_plan"; since: number; plan: Plan }
  | { name: "building"; since: number; plan: Plan; stepIndex: number }
  | { name: "observing"; since: number; buildResult: BuildResult }
  | { name: "fixing"; since: number; errors: Error[]; attempt: number }
  | { name: "delivering"; since: number; artifact: Artifact }
  | { name: "done"; since: number; artifact: Artifact; ok: boolean }
  | { name: "failed"; since: number; error: string; recoverable: boolean };

export const transitions: Record<string, (state: AgentState, event: AgentEvent) => AgentState> = {
  idle: (s, e) => e.type === "send" ? { name: "classifying", since: Date.now(), attempt: 0 } : s,
  classifying: (s, e) => {
    if (e.type === "classified") return { name: "planning", since: Date.now(), classification: e.data };
    if (e.type === "error") return { name: "failed", since: Date.now(), error: e.error, recoverable: true };
    return s;
  },
  planning: (s, e) => {
    if (e.type === "plan_proposed") return { name: "awaiting_plan", since: Date.now(), plan: e.data };
    if (e.type === "no_plan_needed") return { name: "building", since: Date.now(), plan: null, stepIndex: 0 };
    return s;
  },
  awaiting_plan: (s, e) => {
    if (e.type === "plan_approved") return { name: "building", since: Date.now(), plan: e.data, stepIndex: 0 };
    if (e.type === "plan_rejected") return { name: "planning", since: Date.now(), classification: s.classification };
    // NÃO HÁ TIMEOUT — o plano fica pendente para sempre
    return s;
  },
  building: (s, e) => {
    if (e.type === "step_done") return { ...s, stepIndex: s.stepIndex + 1 };
    if (e.type === "all_steps_done") return { name: "observing", since: Date.now(), buildResult: null };
    if (e.type === "error") return { name: "fixing", since: Date.now(), errors: [e.error], attempt: 0 };
    return s;
  },
  observing: (s, e) => {
    if (e.type === "build_passed") return { name: "delivering", since: Date.now(), artifact: e.data };
    if (e.type === "build_failed") return { name: "fixing", since: Date.now(), errors: e.data, attempt: 0 };
    return s;
  },
  fixing: (s, e) => {
    if (e.type === "fixed") return { name: "building", since: Date.now(), plan: s.plan, stepIndex: s.stepIndex };
    if (e.type === "error") return s.attempt < 3
      ? { ...s, attempt: s.attempt + 1 }
      : { name: "failed", since: Date.now(), error: "Max retries exceeded", recoverable: true };
    return s;
  },
  delivering: (s, e) => {
    if (e.type === "delivered") return { name: "done", since: Date.now(), artifact: s.artifact, ok: true };
    return s;
  },
};
```

**Persistência a cada transição:**
```typescript
// Cada transição persiste no DB antes de executar
async function transition(runId: string, event: AgentEvent) {
  const run = await db.runs.findById(runId);
  const nextState = transitions[run.state.name](run.state, event);
  
  // Persiste atomicamente
  await db.runs.update(runId, {
    state: nextState,
    history: [...run.history, { from: run.state.name, to: nextState.name, event, at: Date.now() }],
  });
  
  // Emite evento para SSE
  await emitEvent(runId, { type: "state_change", from: run.state.name, to: nextState.name });
  
  return nextState;
}
```

---

### 4. Workers — Um Worker por Responsabilidade

**Problema atual:** Tudo roda no mesmo Edge Function (`agent-run`), que tem limite de 90s/270s. Se o build demora 3 minutos, a function morre.

**Solução:** Cada fase é um **worker Inngest separado**, com timeout próprio.

```typescript
// inngest/functions/agent-classify.ts
export const agentClassify = inngest.createFunction(
  { id: "agent-classify", retries: 2, timeout: "30s" },
  { event: "agent.classify" },
  async ({ event, step }) => {
    const { runId, projectId, payload } = event.data;
    
    // 1. Carrega contexto
    const context = await step.run("load-context", async () => {
      return loadProjectContext(projectId);
    });
    
    // 2. Classifica
    const classification = await step.run("classify", async () => {
      return classifier.classify(payload.text, context);
    });
    
    // 3. Transiciona estado
    await step.run("transition", async () => {
      return transition(runId, { type: "classified", data: classification });
    });
    
    // 4. Dispara próximo worker
    if (classification.needsPlan) {
      await inngest.send({ name: "agent.plan", data: { runId, projectId, classification } });
    } else {
      await inngest.send({ name: "agent.build", data: { runId, projectId, classification } });
    }
  }
);

// inngest/functions/agent-plan.ts
export const agentPlan = inngest.createFunction(
  { id: "agent-plan", retries: 1, timeout: "60s" },
  { event: "agent.plan" },
  async ({ event, step }) => {
    const { runId, projectId, classification } = event.data;
    
    const plan = await step.run("generate-plan", async () => {
      return planner.generate(classification, await loadProjectContext(projectId));
    });
    
    await step.run("transition", async () => {
      return transition(runId, { type: "plan_proposed", data: plan });
    });
    
    // NÃO dispara próximo worker — espera aprovação do usuário
    // O frontend vai chamar /plan/approve quando o usuário interagir
  }
);

// inngest/functions/agent-build.ts
export const agentBuild = inngest.createFunction(
  { id: "agent-build", retries: 0, timeout: "10m" }, // 10 minutos para builds longos
  { event: "agent.build" },
  async ({ event, step }) => {
    const { runId, projectId, plan } = event.data;
    const steps = plan?.steps ?? [];
    
    for (let i = 0; i < steps.length; i++) {
      await step.run(`execute-step-${i}`, async () => {
        return executor.execute(steps[i], projectId);
      });
      
      // Narra progresso
      await step.run(`narrate-step-${i}`, async () => {
        await emitEvent(runId, { type: "step_done", step: i, total: steps.length });
      });
    }
    
    await step.run("transition", async () => {
      return transition(runId, { type: "all_steps_done" });
    });
    
    await inngest.send({ name: "agent.observe", data: { runId, projectId } });
  }
);

// inngest/functions/agent-observe.ts
export const agentObserve = inngest.createFunction(
  { id: "agent-observe", retries: 1, timeout: "5m" },
  { event: "agent.observe" },
  async ({ event, step }) => {
    const { runId, projectId } = event.data;
    
    const result = await step.run("observe", async () => {
      return observer.observe(projectId);
    });
    
    if (result.ok) {
      await step.run("transition", async () => {
        return transition(runId, { type: "build_passed", data: result.artifact });
      });
      await inngest.send({ name: "agent.deliver", data: { runId, projectId, artifact: result.artifact } });
    } else {
      await step.run("transition", async () => {
        return transition(runId, { type: "build_failed", data: result.errors });
      });
      await inngest.send({ name: "agent.fix", data: { runId, projectId, errors: result.errors } });
    }
  }
);
```

**Vantagens:**
- Cada worker tem **timeout próprio** — build pode demorar 10 min sem morrer
- Cada worker tem **retry próprio** — se classificar falha, retry só da classificação
- Cada worker é **observável** — você vê exatamente qual worker falhou no Inngest dashboard
- O estado é **persistido entre workers** — se o servidor reinicia, Inngest retoma do último `step.run`

---

### 5. Tool Executor — Sandbox Isolada

**Problema atual:** Tools rodam no mesmo processo Deno do loop. Se um `shell_exec` roda `rm -rf /`, destrói tudo.

**Solução:** Cada tool roda em uma **sandbox E2B isolada**, com timeout e quota.

```typescript
// lib/tool-executor.ts
export class ToolExecutor {
  private sandbox: Sandbox;
  
  async execute(tool: ToolCall, projectId: string): Promise<ToolResult> {
    const timeout = toolTimeouts[tool.name] ?? 30_000;
    
    switch (tool.name) {
      case "fs_read":
        return this.sandbox.readFile(tool.args.path);
      case "fs_write":
        return this.sandbox.writeFile(tool.args.path, tool.args.content);
      case "fs_edit":
        return this.sandbox.editFile(tool.args.path, tool.args.oldText, tool.args.newText);
      case "shell_exec":
        // Validação de segurança
        if (isDestructiveCommand(tool.args.command)) {
          return { ok: false, error: "Comando destrutivo bloqueado" };
        }
        return this.sandbox.exec(tool.args.command, { timeout });
      default:
        return { ok: false, error: `Tool desconhecida: ${tool.name}` };
    }
  }
}
```

---

### 6. Preview — Sincronização por Evento

**Problema atual:** O preview sincroniza por polling (`filesSyncKey` + debounce). O frontend fica perguntando "mudou?" a cada 300ms.

**Solução:** O backend **empurra** o preview quando algo muda.

```typescript
// Quando o builder executa fs_write/fs_edit:
await emitEvent(runId, { 
  type: "file_diff", 
  path: "/src/App.tsx",
  previewSync: true 
});

// O frontend recebe via SSE e recarrega o iframe imediatamente
// Não há polling, não há debounce
```

---

### 7. Chat — Uma Thread, Uma Fonte de Verdade

**Problema atual:** O chat é construído no frontend a partir de `messages` + `progress` + `frozenRuns` + `pendingQueueItems`. É uma **projeção** complexa de múltiplas fontes.

**Solução:** O chat é uma **query simples** do banco.

```sql
-- Tabela messages (já existe, mas simplificada)
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  run_id UUID REFERENCES agent_runs(id), -- quem gerou esta mensagem
  type TEXT CHECK (type IN ('text', 'plan', 'narration', 'tool_result', 'error')),
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para query rápida
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

```typescript
// hooks/useChat.ts
function useChat(conversationId: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    staleTime: 500,
  });
}
```

**Não há `buildLovableThread`**. Cada mensagem no banco tem `type` que diz como renderizar:
- `type: "text"` → bubble de texto
- `type: "plan"` → mini card com botões aprovar/rejeitar
- `type: "narration"` → texto em itálico/cinza
- `type: "tool_result"` → mini card com resultado da tool
- `type: "error"` → bubble vermelho

---

### 8. Plano — Persistente e Sem Timeout

**Problema atual:** O plano é um objeto em memória (`pendingPlan`) que expira em 5 min.

**Solução:** O plano é uma **entidade persistente** no banco.

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES agent_runs(id),
  project_id UUID REFERENCES projects(id),
  status TEXT CHECK (status IN ('proposed', 'approved', 'rejected', 'expired')),
  mission TEXT,
  summary TEXT,
  steps JSONB, -- array de { id, description, filePath, enabled }
  markdown TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
```

```typescript
// Quando o planner propõe:
await db.plans.create({
  runId,
  projectId,
  status: "proposed",
  mission: plan.mission,
  steps: plan.steps,
});

// Quando o usuário aprova (via API):
app.post("/plan/approve", async (req, res) => {
  const { planId, steps } = req.body;
  await db.plans.update(planId, { status: "approved", decidedAt: new Date() });
  
  // Dispara builder
  const plan = await db.plans.findById(planId);
  await inngest.send({ name: "agent.build", data: { runId: plan.runId, plan } });
});
```

---

## Fluxo Completo: Do Send ao Done

```
Usuário digita "Crie uma landing page" → Enter

  ↓

[Frontend] POST /api/chat/send
  { projectId, conversationId, text: "Crie uma landing page" }

  ↓

[API Gateway]
  1. Rate limit: ok
  2. Concorrência: nenhum run ativo
  3. Cria run #123 no DB (status: "idle")
  4. Dispara Inngest: agent.classify

  ↓

[Inngest: agent-classify]
  1. Carrega contexto do projeto
  2. Chama LLM: "Classifique este pedido"
  3. Transiciona run #123 → "classifying" → "planning"
  4. Dispara Inngest: agent.plan

  ↓

[Inngest: agent-plan]
  1. Chama LLM: "Crie um plano"
  2. Persiste plano no DB (status: "proposed")
  3. Transiciona run #123 → "awaiting_plan"
  4. Emite SSE: { type: "plan_proposed", planId: "..." }
  5. PARA — espera aprovação

  ↓

[Frontend] Recebe SSE, mostra mini card "Plano proposto"
  Usuário clica "Aprovar"

  ↓

[Frontend] POST /api/plan/approve
  { planId, steps: [...] }

  ↓

[API Gateway]
  1. Atualiza plano → "approved"
  2. Dispara Inngest: agent.build

  ↓

[Inngest: agent-build]
  Para cada passo do plano:
    1. Executa tool (fs_write, shell_exec, etc.)
    2. Emite SSE: { type: "step_done", step: i }
    3. Se tool modifica arquivo → emite SSE: { type: "file_diff", path, previewSync: true }
  
  Transiciona run #123 → "observing"
  Dispara Inngest: agent.observe

  ↓

[Inngest: agent-observe]
  1. Roda build no sandbox
  2. Se passou → transiciona → "delivering" → "done"
     Emite SSE: { type: "done", artifact: {...} }
  3. Se falhou → transiciona → "fixing"
     Dispara Inngest: agent.fix

  ↓

[Frontend] Recebe SSE "done"
  1. Invalida query de messages
  2. Mostra "Done" bubble
  3. Preview já foi sincronizado a cada file_diff
```

---

## Vantagens da Arquitetura Nova

| Aspecto | Antes | Depois |
|---|---|---|
| **Requisições** | 5 canais realtime + polling a cada 12s | 1 SSE por sessão |
| **Estado** | Memória React (some no F5) | Banco de dados (persistente) |
| **Agente** | 1 arquivo de 1.800 linhas | 5 workers separados, cada um com 1 responsabilidade |
| **Retry** | Tudo ou nada | Por fase (classificar pode retry, build não) |
| **Timeout** | 90s/270s para tudo | 30s classificar, 10m build, 5m observar |
| **Plano** | Expira em 5 min | Persiste indefinidamente no DB |
| **Preview** | Polling a cada 300ms | Push via SSE a cada file_diff |
| **Chat** | Projeção complexa de 4 fontes | Query simples do banco |
| **Observabilidade** | Impossível saber onde falhou | Inngest dashboard mostra cada worker |
| **Rollback** | `git reset --hard` (arriscado) | Checkpoint por fase, retoma do último estado |

---

## Implementação Gradual

Não precisa reescrever tudo de uma vez. A transição pode ser feita em 4 fases:

### Fase 1: Gateway + Rate Limit (1 semana)
- Criar `agent-gateway` Edge Function
- Mover rate limiting e controle de concorrência para lá
- Frontend passa a chamar `/api/agent-gateway` em vez de `supabase.functions.invoke`

### Fase 2: SSE Único (1 semana)
- Substituir 5 canais Supabase Realtime por 1 SSE
- Backend emite eventos via SSE
- Frontend usa TanStack Query com invalidação por evento

### Fase 3: Workers Inngest (2 semanas)
- Extrair classificador, planner, builder, observer do `loop.ts`
- Criar 4 workers Inngest separados
- Manter `loop.ts` como orquestrador temporário (chama workers)

### Fase 4: FSM + Persistência (2 semanas)
- Criar tabela `agent_run_states` com máquina de estados
- Cada worker transiciona estado no DB
- Remover `loop.ts` — o orquestrador é a FSM no DB + Inngest

---

## Conclusão

A arquitetura atual do FORGE é um **monolito caótico** onde:
- O frontend tenta ser inteligente (gerencia estado, faz polling, reconstrói thread)
- O backend tenta ser tudo (classifica, planeja, constrói, observa, narra, persiste)
- Ninguém é responsável por nada específico

A arquitetura nova é **orquestrada por eventos** onde:
- O frontend é uma **tela burra** (read-only, SSE, Zustand só para UI)
- O backend é **pipeline de workers** (cada um faz uma coisa, bem feita)
- O banco é a **fonte de verdade** (estado, chat, plano, preview)
- Inngest é o **orquestrador confiável** (retry, timeout, observabilidade)

Isso é como o Lovable.dev funciona — não porque eles copiaram algum padrão, mas porque **quando você resolve o problema de verdade, a arquitetura converge para o mesmo lugar**.
