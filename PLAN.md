# FORGE Flow Canvas v2 — Plano de Desenvolvimento

> **Base de conhecimento para manter contexto entre sessões.**
> Atualizado: 2026-06-26

---

## 1. Stack & Arquitetura

### Frontend
- React 18 + TypeScript + Vite
- ReactFlow (xyflow) para canvas de workflow
- TailwindCSS + variáveis CSS `--ps-*` (tema Prometheus Deep Blue)
- Zod para validação de schemas
- @tanstack/react-router + @tanstack/react-query

### Backend
- Supabase Edge Functions (Deno)
- `npm:zod` para validação em runtime
- PostgreSQL + `pgmq` para filas (futuro)

### n8n Reference Clone
- `/home/rdarienzo/Clones/n8n`
- Componentes de UI: `packages/frontend/editor-ui/src/features/workflows/canvas/`
- Engine de execução: `packages/core/src/execution-engine/workflow-execute.ts`
- Sistema de nós: `packages/nodes-base/nodes/`
- Schemas/constants de design: `packages/frontend/design-system/src/css/`

---

## 2. O Que Já Foi Implementado

### FASE 1 — Node Components Overhaul (commit `128a26e`)

| Sub-fase | Status | Descrição |
|----------|--------|-----------|
| F1.1 NodeIcon | ✅ | badge, context-sizing (48/36/24/20), theme-aware colors, 17 SVGs inline |
| F1.2 BaseNode Sizing | ✅ | `calcNodeSize()` com 5 cardTypes (default/trigger/configuration/configurable/placeholder) |
| F1.3 Status States | ✅ | 8 estados via CSS (running/waiting animado, success/error/pinned/warning/disabled/placeholder) |
| F1.4 StatusIcons | ✅ | Prioridade: error > warning > running > waiting > pinned > success > idle |
| F1.5 NodeToolbar | ✅ | Hover toolbar (run/delete/toggle/more) |
| F1.6 SettingsIcons | ✅ | Indicadores top-right (alwaysOutputData, executeOnce, retryOnFail, continueOnError) |
| F1.7 NodeTooltip | ✅ | 500ms delay, viewport-aware, hide on pan/zoom |
| F1.8 NodePalette | ✅ | `getNodeIconSize("nodeList")` = 24px |
| F1.9 Handle System | ✅ | `showTarget`/`showSource` aceitam `boolean \| number`, non-main handles no lado oposto |

### FASE 2 — Integração Runtime (commit `bb4d8d2`)

| Sub-fase | Status | Descrição |
|----------|--------|-----------|
| F2.1 Status Loop | ✅ | `nodeStatusMap` → `FlowCanvas` → `resolveNodeStatus()` em todos 17 nós |
| F2.2 Shared Validation | ✅ | `node-schemas.ts` em `_shared/`, `validateNodeConfig()` em `gateway-core.ts` |

### Melhorias Adicionais (commit `acf0eca`)

| Item | Status | Descrição |
|------|--------|-----------|
| Multi-Handle | ✅ | `renderHandles()` helper, extra handles no lado oposto |
| nodeStatusMap wiring | ✅ | `FlowBuilderDialog` dono do estado, `TestPanel` + `DebugPanel` conectados |

### Shape Differentiation (commit `8f38a47`)

| Tipo | cardType | iconContext | Nós |
|------|----------|-------------|-----|
| Trigger | `trigger` | canvas (48px) | trigger |
| Configurable | `configurable` | canvas (48px) | llm, tool, rag_search, memory, sub_flow, transformer, vision |
| Configuration | `configuration` | configuration (36px) | condition, switch, output_guard, stt, tts, hitl, loop, delay, error_handler |

---

## 3. Mapa de Gaps vs n8n

### 3.1 Frontend — Canvas Core (Alta Prioridade 🔴)

| # | Item | Descrição | Ref n8n | Esforço |
|---|------|-----------|---------|---------|
| G1 | **Node Creator overlay** | Substituir NodePalette atual por overlay full-screen c/ abas (Trigger/Actions/AI/HITL), busca, categorias, drag-to-canvas | `nodeCreator/` (NodeCreation.vue, NodesMode.vue, SearchBar.vue) | 6h |
| G2 | **Context Menu** | Click direito: Open, Copy, Duplicate, Rename, Replace, Pin, Delete, Color, Execute, Toggle | `contextMenu/` (ContextMenu.vue) | 3h |
| G3 | **Real-time Push** | WebSocket/SSE para atualizar status dos nós em tempo real durante execução | `usePushConnection/` (executionStarted, nodeExecuteBefore/After, executionFinished) | 6h |
| G4 | **Edge Toolbar + Animation** | Toolbar hover na aresta (add node, delete) + fluxo animado durante execução | `CanvasEdgeToolbar.vue`, `CanvasEdge.vue` | 2h |
| G5 | **Control Buttons** | Zoom +/-, fit view, undo, clear execution data, stop execution | `CanvasControlButtons.vue` | 1h |

### 3.2 Frontend — NDV & Data (Média Prioridade 🟡)

| # | Item | Descrição | Ref n8n | Esforço |
|---|------|-----------|---------|---------|
| G6 | **NDV Panel** | Painel lateral completo para configurar nós: inputs ricos, abas Settings/Input/Output | `ndv/` (NodeDetailsViewV2.vue, NDVHeader.vue) | 6h |
| G7 | **Input/Output Viewer** | Visualização Table/JSON/HTML/Markdown/Binary dos dados de execução | `RunData.vue`, `RunDataTable.vue`, `RunDataJson.vue` | 6h |
| G8 | **Expression Editor** | Editor de expressão com autocomplete, syntax highlight | `ExpressionEditModal.vue` | 8h |
| G9 | **Data Mapping** | Arrastar campo da tabela de output para input de parâmetro | `MappingPill.vue` | 4h |
| G10 | **Pinned Data** | Pin/Unpin output como mock data estático | `RunDataPinButton.vue` | 2h |
| G11 | **Execution Log Tree** | Árvore de nós executados com status, timing, contagem | `LogsPanel.vue`, `LogsOverviewPanel.vue` | 4h |
| G12 | **Execution History** | Lista de execuções passadas com filtro, re-executar | `WorkflowExecutionsView.vue`, `ExecutionsFilter.vue` | 4h |

### 3.3 Frontend — UX Patterns (Baixa Prioridade 🟢)

| # | Item | Descrição | Esforço |
|---|------|-----------|---------|
| G13 | **Sticky Notes** | Nó de nota adesiva editável, redimensionável, cores | 2h |
| G14 | **AddNodes (+)** | Botão "+" entre conexões para adicionar nó | 1h |
| G15 | **Node Groups** | Agrupar nós, collapse/expand, title bar | 4h |
| G16 | **Selection Toolbar** | Barra flutuante ao selecionar múltiplos nós | 1h |
| G17 | **Command Bar (Cmd+K)** | Busca universal de ações | 3h |
| G18 | **Copy/Paste nós** | Serializar JSON na clipboard entre abas | 2h |
| G19 | **Auto-layout (Tidy Up)** | Reposicionar nós sem sobreposição | 3h |
| G20 | **Snap-to-grid** | Grade de 20px para alinhamento | 1h |
| G21 | **Node Dirtiness** | Warning quando parâmetros mudam pós-execução | 2h |
| G22 | **Coachmarks/Onboarding** | Tour guiado, setup panel | 4h |
| G23 | **Node Rename** | Renomear inline com F2 | 1h |
| G24 | **Node Colors** | Mudar cor do nó pelo context menu | 1h |

### 3.4 Backend — Execution Engine (Alta Prioridade 🔴)

| # | Item | Descrição | Ref n8n | Esforço |
|---|------|-----------|---------|---------|
| G25 | **Execution Queue** | BFS loop com `nodeExecutionStack`, polling ou fila | `workflow-execute.ts` (processRunExecutionData) | 4h |
| G26 | **Multi-input Merge** | Esperar múltiplos branches antes de executar nó | `waitingExecution` | 3h |
| G27 | **Partial Execution** | Executar só subgrafo (nós modificados desde última execução) | `runPartialWorkflow2()` + DirectedGraph | 6h |
| G28 | **Lifecycle Hooks** | before/after por nó e por workflow, push eventos | `execution-lifecycle-hooks.ts` | 2h |
| G29 | **Retry + Backoff** | retryOnFail com maxTries e waitBetweenTries | linhas 1784-1812 | 2h |
| G30 | **Continue on Error** | onError: continueRegularOutput / continueErrorOutput | linhas 2066-2075 | 1h |
| G31 | **Error Workflows** | Disparar workflow de erro automático | `execute-error-workflow.ts` | 3h |
| G32 | **Cancellation** | Parar execução em andamento via sinal | `PCancelable` | 2h |
| G33 | **Execution Persistence** | Salvar run data completo com pruning configurável | `execution-persistence.ts` | 4h |

### 3.5 Backend — Node System (Média Prioridade 🟡)

| # | Item | Descrição | Esforço |
|---|------|-----------|---------|
| G34 | **Dynamic Node Registry** | Nós carregados de tabela/diretório, não hardcoded | 6h |
| G35 | **Node Property System** | Definição formal de propriedades com tipos, validação, defaults | 4h |
| G36 | **Credentials System** | Armazenamento criptografado, OAuth flow, API keys | 6h |
| G37 | **400+ Integrações** | Conectores para apps externos (Slack, Gmail, GitHub, etc.) | enorme |

---

## 4. Plano de Execução Priorizado

### FASE 3 — Canvas UX Core (Em andamento ✅ 6/8)

| Ordem | Item | Status | Esforço |
|-------|------|--------|---------|
| 3.1 | Edge Toolbar + Animation | ✅ `6e29e1b` | 2h |
| 3.2 | Control Buttons (zoom, fit, undo, clear) | ✅ `6e29e1b` | 1h |
| 3.3 | Context Menu | ✅ `bfdc37f` | 3h |
| 3.4 | Node Creator overlay + busca | ❌ Pendente | 6h |
| 3.5 | Sticky Notes | ✅ `8f1f12b` | 2h |
| 3.6 | AddNodes (+) connector | ❌ Pendente | 1h |
| 3.7 | Copy/Paste nós | ✅ `244a55f` | 2h |
| 3.8 | Snap-to-grid | ✅ `8f1f12b` | 1h |

### FASE 4 — Execution Display

| Ordem | Item | Depende de | Esforço |
|-------|------|-----------|---------|
| 4.1 | Real-time Push (SSE) | G33 (persistence) | 6h |
| 4.2 | Execution Log Tree (melhorias) | 4.1 | 4h |
| 4.3 | Input/Output Viewer | 4.1 | 6h |
| 4.4 | Execution History | G33 | 4h |

### FASE 5 — NDV & Configuration

| Ordem | Item | Depende de | Esforço |
|-------|------|-----------|---------|
| 5.1 | NDV Panel base | — | 6h |
| 5.2 | Pinned Data | 4.3 | 2h |
| 5.3 | Expression Editor | 5.1 | 8h |
| 5.4 | Data Mapping | 5.1 + 5.3 | 4h |

### FASE 6 — Execution Engine (Backend)

| Ordem | Item | Depende de | Esforço |
|-------|------|-----------|---------|
| 6.1 | Execution Queue (pgmq) | — | 4h |
| 6.2 | Lifecycle Hooks | 6.1 | 2h |
| 6.3 | Retry + Backoff | 6.1 | 2h |
| 6.4 | Continue on Error | 6.1 | 1h |
| 6.5 | Cancellation | 6.1 | 2h |
| 6.6 | Multi-input Merge | 6.1 | 3h |
| 6.7 | Error Workflows | 6.1 | 3h |
| 6.8 | Partial Execution | 6.1 | 6h |
| 6.9 | Execution Persistence | — | 4h |

### FASE 7 — UX Patterns

| Ordem | Item | Depende de | Esforço |
|-------|------|-----------|---------|
| 7.1 | Node Rename (F2) | — | 1h |
| 7.2 | Node Colors | G2 (context menu) | 1h |
| 7.3 | Node Dirtiness | — | 2h |
| 7.4 | Selection Toolbar | — | 1h |
| 7.5 | Node Groups | — | 4h |
| 7.6 | Auto-layout | — | 3h |
| 7.7 | Command Bar (Cmd+K) | — | 3h |
| 7.8 | Coachmarks/Onboarding | — | 4h |

---

## 5. Estrutura de Arquivos (Referência Rápida)

### Frontend — Flow Builder
```
src/components/forge-agents/flow-builder/
├── FlowBuilderDialog.tsx          # Orquestrador principal
├── FlowCanvas.tsx                 # ReactFlow canvas (17 nós registrados)
├── FlowToolbar.tsx                # Barra superior (nome, salvar, publicar)
├── FlowPanelRenderer.tsx          # Lazy-loaded panels (test, debug, logs, etc.)
├── NodePalette.tsx                # Paleta de nós (simples)
├── NodePropertiesPanel.tsx        # Painel de propriedades do nó
├── EdgePropertiesPanel.tsx        # Painel de propriedades da aresta
├── nodes/
│   ├── BaseNode.tsx               # Componente base: cardType, status, handles, toolbar
│   ├── NodeIcon.tsx               # Ícones com context-sizing + cores
│   ├── NodeToolbar.tsx            # Hover toolbar
│   ├── NodeTooltip.tsx            # Tooltip com delay
│   ├── SettingsIcons.tsx          # Indicadores de configuração
│   ├── CanvasNodeStatusIcons.tsx  # Status display com prioridade
│   ├── TriggerNode.tsx + 16 outros # Node types específicos
└── hooks/
    ├── useFlowBuilderState.ts     # Estado centralizado (nodes, edges, save, undo)
    └── useFlowShortcuts.ts        # Atalhos de teclado
```

### Backend — Edge Functions
```
supabase/functions/_shared/
├── gateway-core.ts                # Executor inline (switch 17 tipos)
├── gateway-bfs.ts                 # BFS execution engine
├── node-schemas.ts                # Schemas Zod validados (npm:zod)
├── condition-evaluator.ts         # Avaliador de expressões (Condition node)
├── output-guards.ts               # Output guards (PII, toxicity, etc.)
├── executor-llm.ts                # Executor LLM especializado
├── executor-tool.ts               # Executor Tool
├── executor-memory.ts             # Executor Memory
├── executor-subflow.ts            # Executor SubFlow
├── executor-vision.ts             # Executor Vision
└── ...
```

### n8n Reference — Paths Úteis
```
/home/rdarienzo/Clones/n8n/packages/frontend/editor-ui/src/
├── features/workflows/canvas/     # Componentes do canvas
│   ├── components/Canvas.vue      # VueFlow canvas (keybindings, events)
│   ├── components/elements/nodes/ # Renderização de nós
│   │   └── render-types/          # Default, StickyNote, AddNodes, ChoicePrompt
│   └── composables/               # useCanvas, useCanvasNode, etc.
├── features/shared/nodeCreator/   # Node Creator overlay
├── features/ndv/                  # Node Details View
├── features/execution/            # Execution logs, history
└── app/composables/               # usePushConnection, useHistoryHelper, etc.

/home/rdarienzo/Clones/n8n/packages/core/src/execution-engine/
├── workflow-execute.ts            # Engine principal (BFS loop)
└── execution-lifecycle-hooks.ts   # Hooks before/after

/home/rdarienzo/Clones/n8n/packages/nodes-base/nodes/ # 400+ integrações
```

---

## 6. Padrões de Código

### Node Type Pattern
```tsx
export function XxxNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      cardType="configurable"       // trigger | configurable | configuration | default
      iconContext="canvas"          // canvas (48px) | configuration (36px) | nodeList (24px)
      selected={selected}
      status={resolveNodeStatus(data)}
      icon={getNodeIconSource("xxx")}
      label="Xxx"
      subtitle={...}
    >
      {children && (
        <div className="absolute top-full mt-7 left-1/2 -translate-x-1/2">
          {children}
        </div>
      )}
    </BaseNode>
  );
}
```

### Status Injection Flow
```
FlowBuilderDialog (nodeStatusMap state)
  → FlowCanvas (nodeStatusMap prop)
    → displayNodes() injects status into node data
      → BaseNode resolves resolveNodeStatus(data)
        → Status CSS classes + NodeStatusIcon
```

### CSS Status Classes (BaseNode)
```
node-running    → border transparent + ::after conic-gradient 1.5s
node-waiting    → border transparent + ::after conic-gradient 4.5s
node-success    → border 2px var(--color--success)
node-error      → border 2px var(--color--danger)
node-selected   → box-shadow 0 0 0 6px rgba(255,255,255,0.15)
node-pinned     → border 2px #5555aa
node-warning    → border 2px #f59e0b
node-disabled   → opacity 0.5 + strikethrough
```

---

## 7. Commits (Histórico)

| Commit | Mensagem |
|--------|---------|
| `128a26e` | feat(flow-canvas): n8n-style node components overhaul |
| `6d3d0ac` | fix(monitoring): adicionar import do useQuery |
| `f7c9b20` | fix(monitoring): remove header duplicado |
| `0a0c718` | feat(routes): editor e monitoring como rotas independentes |
| `bb4d8d2` | feat(forge-flow): node status feedback loop + shared Zod validation |
| `acf0eca` | feat(flow-canvas): multi-handle system + nodeStatusMap wiring |
| `8f38a47` | fix(flow-canvas): distinct node shapes per type (n8n-aligned) |

---

## 8. Comandos Úteis

```bash
# TypeScript check
npx tsc --noEmit --pretty false

# Vercel build
VERCEL=1 npx vite build

# Git
git status
git log --oneline -10
git diff --stat

# N8n reference grep
grep -r "trigger" /home/rdarienzo/Clones/n8n/packages/frontend/editor-ui/src/features/workflows/canvas/ --include="*.vue" | head -20
```
