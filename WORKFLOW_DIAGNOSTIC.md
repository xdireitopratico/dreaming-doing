# Diagnóstico Profundo: Workflow de Vibe Coding Quebrado

## TL;DR

O FORGE tem **bugs técnicos corrigidos**, mas a **arquitetura de experiência está quebrada**. O usuário não consegue fazer um build sequer porque a cadeia de vibe coding — **descrever → planejar → aprovar → construir → ver → iterar** — tem falhas em cada junção.

---

## 1. Estado Some no Reload ("Comunicações se perdem")

### O Problema

Todo o estado do agente vive em **memória React**:

```typescript
// useAgentRun.ts — TUDO em memória
const [progress, setProgress] = useState<AgentProgress>(initialAgentProgress);
const [activeRunId, setActiveRunId] = useState<string | null>(null);
const [frozenRuns, setFrozenRuns] = useState<Map<string, FrozenRunSnapshot>>(new Map());
const lastSeqRef = useRef(0); // seq do realtime
```

Quando o usuário dá **F5**:
- `progress` → volta para `initialAgentProgress` (tudo zerado)
- `activeRunId` → `null` (não sabe qual run estava ativa)
- `frozenRuns` → Map vazio (perde histórico de runs anteriores)
- `lastSeqRef` → 0 (vai reprocessar eventos do zero ou pular)
- `streamText` → `null` (perde o que o agente estava dizendo)

### O que o usuário vê

1. Agente está rodando, mostrando "Executando passo 3/5…"
2. Usuário dá F5 (ou o hot-reload do Vite dispara)
3. Tela volta para "Visualizando última versão salva"
4. Nenhuma indicação de que havia um run em andamento
5. Se o usuário envia nova mensagem, cria um **segundo run paralelo**
6. Chaos: dois runs competindo, mensagens duplicadas, estado inconsistente

### Por que acontece

O `useAgentSessionCoordinator` tenta recuperar, mas só funciona se:
- `pendingAgentRunKey` existir (última msg do user sem resposta)
- E não houver `running || connected || isAgentConnectInFlight()`

Se o usuário deu F5 durante um run ativo, `running` é `false` (estado resetou), então o coordinator pode tentar iniciar um NOVO run, ignorando o que estava rodando no servidor.

### A Solução

Persistir estado crítico no `sessionStorage`:

```typescript
// useAgentRun.ts — ao desmontar ou a cada evento terminal
useEffect(() => {
  const snapshot = {
    activeRunId: runIdRef.current,
    lastSeq: lastSeqRef.current,
    progress: progress, // ou subset
    frozenRuns: Array.from(frozenRuns.entries()),
    timestamp: Date.now(),
  };
  sessionStorage.setItem('forge:agent-snapshot', JSON.stringify(snapshot));
}, [progress, frozenRuns]);

// Ao montar — recuperar
useEffect(() => {
  const raw = sessionStorage.getItem('forge:agent-snapshot');
  if (raw) {
    const snap = JSON.parse(raw);
    // Verificar se não é stale (> 30 min)
    if (Date.now() - snap.timestamp < 30 * 60 * 1000) {
      runIdRef.current = snap.activeRunId;
      setActiveRunId(snap.activeRunId);
      lastSeqRef.current = snap.lastSeq;
      // Não setProgress direto — fazer catchUp do run
      if (snap.activeRunId) {
        subscribeToRun(snap.activeRunId, { resetProgress: false });
      }
    }
  }
}, []);
```

---

## 2. Sem Auto-Save no Chat

### O Problema

O textarea do chat é puro `useState`:

```typescript
const [input, setInput] = useState("");
const [attachments, setAttachments] = useState<File[]>([]);
const historyRef = useRef<string[]>([]);
```

Se o usuário:
- Digita 3 parágrafos de prompt
- Dá F5 antes de enviar
- **Tudo some**

Não há `localStorage`, não há `sessionStorage`, não há recovery.

### A Solução

```typescript
// ChatInput.tsx
useEffect(() => {
  const timer = setTimeout(() => {
    if (input.trim()) {
      sessionStorage.setItem('forge:chat-draft', JSON.stringify({
        input,
        attachments: attachments.map(f => ({ name: f.name, size: f.size, type: f.type })),
        timestamp: Date.now(),
      }));
    } else {
      sessionStorage.removeItem('forge:chat-draft');
    }
  }, 500);
  return () => clearTimeout(timer);
}, [input, attachments]);

// Ao montar
useEffect(() => {
  const raw = sessionStorage.getItem('forge:chat-draft');
  if (raw) {
    const draft = JSON.parse(raw);
    if (Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
      setInput(draft.input);
      // attachments precisam ser re-selecionados (File objects não serializam)
      // mas podemos mostrar um hint: "Você tinha X anexos"
    }
  }
}, []);
```

---

## 3. Mini Card Consome Thread Inteira

### O Problema

O `ForgeAssistantBlock` renderiza TUDO em um único bloco:

```
┌─ FORGE ──────────────────────────────┐
│ Step 3/5                             │
│ "Executando passo 3/5…"              │
│                                      │
│ [Activity Card]                      │
│   • fs_write src/App.tsx             │
│   • shell_exec npm run build         │
│   • fs_edit src/index.css            │
│   • (mais 5 tools…)                  │
│                                      │
│ [Turn Receipt]                       │
│   • 8 arquivos alterados             │
│                                      │
│ [Collapsible: Detalhes técnicos]     │
│   Timeline: 12 eventos               │
│   • phase: gather                    │
│   • tool_start: fs_read              │
│   • tool_done: fs_read (ok)          │
│   • (mais 20 itens…)                │
│                                      │
│ [Plan Viewer — se houver plano]      │
│   Plano proposto                     │
│   Missão: Criar landing page         │
│   5/7 passos                         │
│   [Aprovar] [Rejeitar]               │
│                                      │
│ [ChatDiffViewer — se houver diffs]   │
│   ┌─ src/App.tsx ─────────────────┐  │
│   │ - <div>Hello</div>            │  │
│   │ + <div>Hello World</div>      │  │
│   └────────────────────────────────┘  │
│                                      │
│ [Footer: Copiar | Desfazer]          │
└──────────────────────────────────────┘
```

Isso é um **muro de informação**. O usuário não consegue:
- Ver o que o agente está **fazendo agora** vs. o que já **fez**
- Distinguir narração de ferramentas de código de diffs
- Saber se pode interagir (aprovar plano) ou deve esperar

### Por que acontece

O `AgentActivityCard` usa `useEffect` com `setInterval` de 5s para trocar dicas:
```typescript
const id = window.setInterval(() => setTipSeed((n) => n + 1), 5000);
```
Isso força re-render a cada 5s, causando layout shift.

Além disso, o card não tem **altura máxima** nem **scroll interno**. Quando há 10+ tools, o card empurra todo o resto para baixo.

### A Solução

**Separar em zonas com altura controlada:**

```
┌─ FORGE ──────────────────────────────┐
│ [Status Bar fixa — 24px]             │
│ "Passo 3/5 · Editando App.tsx"        │
├──────────────────────────────────────┤
│ [Narração — max 200px, scroll]       │
│ "Vou criar um hero section com…"     │
├──────────────────────────────────────┤
│ [Tools ativas — max 120px, scroll]   │
│ ● fs_write App.tsx ✓                 │
│ ○ shell_exec npm run build …         │
├──────────────────────────────────────┤
│ [Diffs — collapsible, default closed]│
│ ▶ 3 arquivos alterados               │
├──────────────────────────────────────┤
│ [Ações — sempre visíveis]             │
│ [Copiar] [Desfazer]                  │
└──────────────────────────────────────┘
```

---

## 4. Falta Interação no Chat

### O Problema

O chat é **unidirecional e passivo**:

```
Usuário: "Crie uma landing page"
Agente: [processa por 3 minutos em silêncio]
Agente: "Pronto! Criei 8 arquivos."
```

Durante os 3 minutos:
- O usuário não sabe se o agente está vivo
- Não pode perguntar "o que você está fazendo?"
- Não pode cancelar sem perder tudo
- Não pode ver preview parcial

### O que deveria acontecer (Vibe Coding Real)

```
Usuário: "Crie uma landing page"
Agente: "Entendi — landing page. Vou começar lendo os arquivos atuais…"
  [1s depois]
Agente: "Encontrei o scaffold Vite. Vou criar: Hero, Features, CTA."
  [Usuário pode responder: "Sem CTA, só Hero e Features"]
Agente: "Ok, ajustando — só Hero e Features."
  [Continua construindo]
  [Preview atualiza a cada arquivo salvo]
```

### Por que não funciona

1. **O agente não narra em tempo real** — `streamText` só é emitido quando o LLM retorna texto. Durante execução de tools, há silêncio.
2. **Não há "typing indicator" real** — o `narration.showTyping` é um boolean simples.
3. **O usuário não pode interromper para ajustar** — cancelar = perder tudo.
4. **O preview só atualiza no final** — `previewSyncTick` incrementa, mas o sync só acontece quando o `useEditorAgentOrchestration` detecta mudança.

### A Solução

**Narração proativa:**

```typescript
// loop.ts — antes de cada tool batch
this.streamNarration(`Vou editar ${modifiedPaths.join(", ")}…`);

// Depois de cada tool batch
this.streamNarration(`${modifiedPaths.length} arquivo(s) atualizado(s).`);

// Se o build falha
this.streamNarration(`Build falhou — corrigindo ${errorCount} erro(s)…`);
```

**Preview incremental:**

```typescript
// loop.ts — após cada fs_write/fs_edit com sucesso
this.emit("preview_sync", { path, reason: "fs_change", force: true });
```

E no frontend, reagir a `preview_sync` com force:
```typescript
// useEditorAgentOrchestration.ts
useEffect(() => {
  if (agent.progress.previewSyncTick) {
    void syncPreviewToSandbox(true); // force reload
  }
}, [agent.progress.previewSyncTick]);
```

---

## 5. A Cadeia de Vibe Coding Está Quebrada

### A Cadeia Ideal

```
1. Descrever → 2. Planejar → 3. Aprovar → 4. Construir → 5. Ver → 6. Iterar
     ↑___________________________________________________________|
```

### Onde Quebra no FORGE

#### **1→2: Descrever → Planejar**

**Problema:** O classificador (`router.ts`) pode falhar silenciosamente e cair no fallback:
```typescript
catch {
  return { complexity: 3, type: "modify", summary: userPrompt.slice(0, 100), needsBuild: true, needsDeps: false };
}
```

Um "Oi, tudo bem?" vira `type: "modify"`, `needsBuild: true`. O agente tenta construir algo sem saber o quê.

**Problema:** O plano é proposto como um **mini card no meio do chat**. O usuário não sabe que precisa interagir. O card parece uma mensagem qualquer.

#### **2→3: Planejar → Aprovar**

**Problema:** O `PlanViewer` é um card pequeno com botões minúsculos:
```tsx
<button className="px-1.5 py-0.5 rounded ... font-mono text-[9px]">
  <X className="size-2.5" /> Rejeitar
</button>
```

Fonte de **9px**. Em uma tela de 13", isso é quase ilegível.

**Problema:** Se o usuário não aprova nem rejeita, o plano fica pendente **eternamente**. A run fica em `awaiting_user`, mas o usuário pode não perceber.

#### **3→4: Aprovar → Construir**

**Problema:** Após aprovar, o frontend chama `planApproveFn`, que dispara uma NOVA run. Mas:
- A mensagem do plano aprovado é injetada no histórico (`injectPlanApprovalMessage`)
- Se houver múltiplas retomadas, a mensagem é injetada **múltiplas vezes**
- O LLM fica confuso com mensagens duplicadas

**Problema:** A nova run pode não encontrar o `planSourceRunId` correto, e o agente re-classifica do zero.

#### **4→5: Construir → Ver**

**Problema:** O preview só atualiza quando:
1. O agente emite `preview_sync` evento
2. O `useEditorAgentOrchestration` detecta `previewSyncTick` mudou
3. Chama `syncPreviewToSandbox` com debounce de 300-800ms

Isso significa que o preview pode ficar **parado por minutos** enquanto o agente edita 20 arquivos.

**Problema:** Se o build falha, o preview mostra a **versão quebrada** (porque o sandbox tem os arquivos modificados, mesmo que o build não passe).

#### **5→6: Ver → Iterar**

**Problema:** Se o usuário envia "Muda a cor do botão" enquanto o agente está rodando:
1. A mensagem vai para a **fila** (`pending_queue`)
2. O usuário vê um contador "1 na fila" em fonte 10px
3. A mensagem some do input, mas não aparece no chat
4. O usuário não sabe se a mensagem foi enviada ou não

**Problema:** A fila só processa quando o run atual termina. Se o run atual crasha, a fila pode ficar **presa**.

---

## 6. Problemas Específicos do Realtime

### A. `lastSeqRef` Compartilhado

```typescript
const lastSeqRef = useRef(0); // ÚNICO para todos os runs
```

Se o usuário tem run A (seq 500) e inicia run B (seq começa em 0):
- `catchUpRun(B)` faz `.gt("seq", 500)` → **nenhum evento encontrado**
- Run B parece "vazio" no frontend

### B. `frozenRuns` Sem Limite

```typescript
const [frozenRuns, setFrozenRuns] = useState<Map<string, FrozenRunSnapshot>>(new Map());
```

A cada run terminada, adiciona uma entrada. Sem `delete` automático. Após 50 runs:
- Map com 50 entradas
- Cada re-render itera sobre todas
- Performance degrada

### C. `applyStreamRow` Não Filtra Eventos Stale

```typescript
if (row.seq <= lastSeqRef.current && !isFreshForStart) return false;
```

Se um evento chega atrasado (reorder do Supabase Realtime), é ignorado. Mas se for um evento **crítico** (ex: `finish`), o frontend nunca sabe que o run terminou.

---

## 7. O Que Falta para Fechar a Cadeia

### Prioridade P0 (Sem isso, vibe coding não funciona)

| # | Problema | Solução |
|---|---|---|
| 1 | Estado some no reload | Persistir `activeRunId`, `lastSeq`, `progress` em `sessionStorage` |
| 2 | Sem auto-save do textarea | Salvar `input` em `sessionStorage` a cada 500ms |
| 3 | Preview não atualiza durante build | Force-sync a cada `file_diff`, não só no final |
| 4 | Fila invisível | Mostrar mensagens pendentes como "bubbles cinzas" no chat |
| 5 | Plano não é óbvio | Destacar plano pendente com banner fixo, não mini card |
| 6 | Narração silenciosa | Emitir narração antes/depois de cada batch de tools |
| 7 | `lastSeqRef` compartilhado | Isolar `lastSeq` por `runId` (Map<runId, number>) |

### Prioridade P1 (Melhora significativa)

| # | Problema | Solução |
|---|---|---|
| 8 | Mini card consome thread | Altura máxima + scroll interno + zonas separadas |
| 9 | Activity Card pula | Memoizar + animações suaves + altura fixa |
| 10 | Scroll desce antes do conteúdo | `ResizeObserver` + scroll após layout estabilizar |
| 11 | `frozenRuns` sem limite | Prune automático: manter só últimos 5 |
| 12 | Classificador fallback perigoso | Se prompt < 50 chars e não é build, retornar `type: "other"` |

### Prioridade P2 (Polish)

| # | Problema | Solução |
|---|---|---|
| 13 | Botões de plano minúsculos | Fonte 12px + padding generoso |
| 14 | Diffs sempre abertos | Default collapsed, abrir sob demanda |
| 15 | TurnReceipt some em runs curtas | Sempre mostrar, mesmo com 0 arquivos |
| 16 | `streamText` sem espaços | Adicionar `\n\n` entre chunks append |

---

## 8. Arquitetura Recomendada (Visão Futura)

```
┌─────────────────────────────────────────────┐
│  Chat Layer (React)                         │
│  ├── MessageList (virtualized, 50 items)   │
│  ├── InputArea (auto-save, @mentions)      │
│  └── StatusBar (run state, queue count)     │
├─────────────────────────────────────────────┤
│  State Layer (Zustand + sessionStorage)    │
│  ├── agentStore (progress, runs, frozen)   │
│  ├── chatStore (messages, draft, history)    │
│  └── previewStore (sync state, url)        │
├─────────────────────────────────────────────┤
│  Sync Layer (Supabase Realtime)             │
│  ├── agent_stream_events (por runId)        │
│  ├── agent_runs (status, heartbeat)        │
│  └── messages (chat history)               │
├─────────────────────────────────────────────┤
│  Agent Layer (Inngest + Edge Functions)     │
│  ├── Loop (classify → plan → execute)      │
│  ├── Observer (build, typecheck, lint)    │
│  └── Sandbox (E2B, preview, git)           │
└─────────────────────────────────────────────┘
```

### Mudanças Críticas

1. **Zustand em vez de useState/useRef** — estado global acessível de qualquer componente
2. **sessionStorage como source of truth** — sobrevive a F5, hot-reload, crash
3. **Virtualização da MessageList** — só renderiza mensagens visíveis
4. **Preview sync por evento** — cada `file_diff` → force reload do iframe
5. **Fila visual no chat** — mensagens pendentes aparecem como "enviando…"
6. **Plano como modal** — overlay central, não mini card

---

## Conclusão

O FORGE é um **motor potente com um painel de controle quebrado**. Os bugs técnicos que corrigimos (N+1, rollback, lint) são importantes, mas o usuário não sente diferença porque a **experiência de uso** continua confusa.

Para que o vibe coding funcione, precisamos:
1. **Persistir estado** — o usuário não pode perder contexto no reload
2. **Mostrar progresso** — o usuário precisa ver o que está acontecendo em tempo real
3. **Permitir interação** — o usuário precisa poder ajustar durante a execução
4. **Sincronizar preview** — o usuário precisa ver o resultado a cada mudança
5. **Tornar a fila visível** — o usuário precisa saber que suas mensagens estão na fila
6. **Destacar planos** — o usuário precisa saber que precisa aprovar algo

Sem essas 6 coisas, o agente pode gerar código perfeito — e o usuário nunca vai saber, porque a interface o trai a cada passo.
