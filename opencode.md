# FORGE — opencode.md (Contexto Comprimido)

## 📍 Estado Atual
- **Branch:** `main` @ `4663170`
- **Deploy:** Supabase `dpduljngdurfpmaclffa` (agent-run) + Vercel (frontend)
- **Stack:** TanStack Start + React 19 + Tailwind v4 + Supabase + E2B
- **Último deploy:** **Fase 3 (DX & Onboarding) concluída** — Onboarding wizard + TASTE refactor + ConsoleLogStream + ChatDiffViewer + /skills marketplace
- **Próxima fase:** Fase 4 — Polish & Hardening

---

## 🧠 TASTE — Conceito (corrigido)

**TASTE não é um modo de chat. TASTE é um ESTADO DE USUÁRIO.**

| | |
|---|---|
| O que é TASTE | Usuário NOVO que acabou de chegar na plataforma e nunca fez Setup |
| O que NÃO é | TASTE ≠ modo de chat persistente. TASTE ≠ "sessão taste" |
| Quando termina | Assim que o usuário completa o Setup (API Keys + Modelo + Sandbox E2B + Deploy) |
| Pós-Setup | TASTE deixa de existir para esse usuário. Vale o que ele configurou (BYOK / Robin / Fixed) |
| Equívoco antigo | Tratar `taste_chat` / `taste_start` como session kinds que coexistem com `byok` |

**Na prática:**
- `taste_chat_remaining` / `taste_start_remaining` no DB = **contadores de cortesia** que só decrescem quando `hasUserLlmKey === false` (perfil ainda em TASTE)
- `SessionKind` em runtime deve ter **apenas 2 valores**: `"taste"` (pré-setup) e `"byok"` (pós-setup)
- `"taste_chat"` e `"taste_start"` deixam de ser session kinds e viram **ações permitidas dentro do estado TASTE** (50 mensagens de chat + 1 start de projeto, grátis, até o usuário fazer setup)
- Tudo que hoje chama `taste_chat` / `taste_start` no fluxo → renomear para `taste.chat()` / `taste.startProject()`

**Indicador no UI:**
- Banner de TASTE só aparece quando `hasUserLlmKey === false && (tasteChatRemaining > 0 || tasteStartRemaining > 0)`
- Assim que `hasUserLlmKey === true`, **nenhum elemento que mencione "taste" é renderizado**

---

## 🧠 Learnings (O que funciona / armadilhas)

### Agent Loop (Edge Function)
| Aprendizado | Detalhe |
|-------------|---------|
| **Streaming SSE** | Funciona bem, mas `controller.close()` no catch evita memory leak |
| **Checkpoint a cada step** | `agent_checkpoints` table salva estado completo — resume real funciona |
| **Robin Pool** | 5 chaves NVIDIA/Groq: `nextKey()` retorna `null` se todas em cooldown; `timeUntilNextAvailable()` espera real |
| **Timeout Edge (120s)** | Hard limit. Solução: **worker desacoplado (`agent-worker`)** + PGMQ queue (`agent_chunks_queue`) — chunks inline de até 48 steps no fallback |
| **Build sem deps** | `npm install` ANTES do `npm run build` no Observer resolveu 80% falhas |
| **Type-check incremental** | `tsc --noEmit file1.ts file2.ts` 10x mais rápido que projeto inteiro |
| **Rollback git** | `git reset --hard HEAD~1` após 2ª falha de build evita loop de piora |
| **Fase QUALIFY** | Brainstorm proativo no início do run: classifica complexidade, propõe plano, exige `tool_choice: required` nos primeiros 2-3 passos |
| **agent-stream queue** | `agent_stream_events` (Supabase Realtime) substitui SSE direto — frontend assina channel, não mais `EventSource` |
| **Resume sem reclassificar** | `agent-run` carrega checkpoint do banco e **NÃO** reroda o router/qualify — só continua o loop de onde parou |
| **E2B worker** | `agent-worker` (Edge Function separada) roda o loop no E2B com relay de eventos pra `agent_stream_events`; cai pra `agent-run` se E2B falhar |
| **Template E2B** | `code-interpreter-v1` (nodejs removido) — `runner.mjs` embutido na função |

### Frontend (TanStack Start)
| Aprendizado | Detalhe |
|-------------|---------|
| **Route Tree** | `src/routes/` + `routeTree.gen.ts` — SSR + SPA híbrido |
| **Auth** | `@lovable.dev/cloud-auth-js` + Supabase — session no `QueryClient` context |
| **SSE → Realtime** | `useSSE.ts` migrou pra `supabase.channel('agent_stream_events')` — reconexão automática do Realtime |
| **Preview E2B** | Iframe `https://{port}-{sandboxId}.e2b.app` — HMR funciona se Vite config `allowedHosts: true` |
| **Realtime files** | `supabase.channel('project_files').on('postgres_changes'...)` — sync de arquivos no editor |
| **Tool labels humanos** | `tool-labels.ts` mapeia `shell → "Executando comandos"`, `fs_write → "Criando arquivo"` — UI exibe nomes em PT-BR |
| **CodeBlock + Markdown** | `code-block.tsx` (syntax highlight) + `markdown-renderer.tsx` (markdown c/ tokens `@theme`) substituem `<pre>` cru |
| **ToolCallDetails** | Expansível por tool: input, output truncado, status, latência |
| **Editor dropdowns amarelos** | `:not([role="tab"])` no `.forge-view-icon-tab` + `[data-radix-menu-content]` em `editor-workspace.css` — borda/fonte em `var(--forge-primary)` |
| **Typecheck zero** | 40 → 0 erros TS (commit `6dd81f2`): tool-icons desatualizados (lucide 0.575), `Omit<...>` em `CodeBlockWithHighlight`, cast em `useConnectors`, `Components` do react-markdown |

### Banco (Supabase)
| Tabela | Propósito |
|--------|-----------|
| `projects` | Core + `meta.previewSandboxId` (E2B lease 30d) |
| `agent_runs` | Histórico de execuções + `meta` (provider, model, robin, session_kind) |
| `agent_checkpoints` | `state` JSONB = `AgentState` serializado — resume exato |
| `agent_plans` | Planos persistidos (realtime) |
| `agent_chunks_queue` | PGMQ queue — chunks de até 48 steps inline, escapa 120s |
| `agent_stream_events` | Event store por run (realtime) — substitui SSE direto |
| `connectors` | `kind` + `provider` + `token_encrypted` (multi-provider) |
| `file_embeddings` | pgvector 1536 — RAG futuro |
| `skills` + `project_skills` | Marketplace skills (built-in + user) |
| `profiles` | `taste_chat_remaining` / `taste_start_remaining` (só decrementam se `hasUserLlmKey === false`) |

---

## ✅ Execuções Realizadas

### Fase 1 — Confiabilidade Core (Commit `969679e`)
| Task | Arquivo | Status |
|------|---------|--------|
| Checkpoint automático a cada 2 steps/fase | `loop.ts:127-149` | ✅ |
| Rollback automático `git reset --hard HEAD~1` | `loop.ts:151-162` | ✅ |
| Max steps dinâmico `complexity * 5 + 5` | `loop.ts:30-32,210` | ✅ |
| Stuck detection proativa (pré-execução) | `loop.ts:17-20,278-288` | ✅ |
| Timeout handling 110s + checkpoint forçado | `loop.ts:27,224-232` | ✅ |
| `npm install` automático no Observer | `observer.ts:21-41` | ✅ |
| Robin Pool aguarda cooldown expirar | `robin-pool.ts:32-60,83-96` | ✅ |

### Fase 2 — Qualidade de Código (Commit `cb244e9`)
| Task | Arquivo | Status |
|------|---------|--------|
| Stack prompts: nextjs-app-router, tanstack-start, expo, astro, node-api | `prompts.ts` | ✅ |
| DESIGN_DISCIPLINE: tokens `@theme`, a11y WCAG AA, mobile-first | `prompts.ts:5-11` | ✅ |
| Skill `design-system` (tokens, componentes base, a11y) | `skills.ts` | ✅ |
| Skill `testing` (Vitest+RTL+Playwright patterns) | `skills.ts` | ✅ |
| Skill `tanstack-start`, `expo`, `astro` atualizadas | `skills.ts` | ✅ |
| Quick TypeCheck incremental (`tsc` só arquivos modificados) | `observer.ts:140-200` | ✅ |
| Loop integra quickTypeCheck pós `fs_write/fs_edit` | `loop.ts:341-365` | ✅ |
| EXECUTE_PROMPT exige geração de testes | `prompts.ts:227` | ✅ |

### Fase 2.5 — Design System Enforcement + Visual Features (Commit `9ba4932`)
| Task | Arquivo | Status |
|------|---------|--------|
| **@forge/ui package** criado: tokens, Button, Input, Card, Dialog, Toast, Motion (FadeIn, SlideIn, ScaleIn, Stagger, HoverScale, HoverLift, Pulse, Shimmer), hooks | `packages/forge-ui/` | ✅ |
| **skills.ts**: design-system skill enforça @forge/ui — proíbe reimplementar Button/Input/Card/Dialog/Toast | `skills.ts:133-167` | ✅ |
| **observer.ts**: checkDesignSystem() valida @forge/ui instalado, tokens @theme, rejeita classes Tailwind raw/hardcoded | `observer.ts:49-54, 205-280` | ✅ |
| **prompts.ts**: DESIGN_DISCIPLINE expandido com regras obrigatórias @forge/ui + motion + tokens + proibidos | `prompts.ts:13-70` | ✅ |
| **ChatStream**: copy message button, token usage display (~tokens), undo (apaga última msg assistente + usuário anterior) | `ChatStream.tsx` | ✅ |
| **AgentPanel**: FadeIn animation + @forge/ui Button | `AgentPanel.tsx` | ✅ |
| **ChatStream**: FadeIn on messages (staggered), @forge/ui Button | `ChatStream.tsx` | ✅ |
| **Editor page**: handleUndoMessage() deleta msg assistente + usuário do DB + invalida queries | `index.tsx:660-680` | ✅ |

### Fase 2.6 — Tool UX + E2B Robusto (Commits `49d4212`..`c28c83e`)
| Task | Arquivo | Status |
|------|---------|--------|
| Recupera E2B de chave salva em API Keys (não só fresh) | `e2b-status.ts`, `connector-keys.ts` | ✅ |
| Migra template E2B pra `code-interpreter-v1` | `project-sandbox.ts` | ✅ |
| `runner.mjs` embutido na função + recupera preview porta 5173 | `agent-run/index.ts`, `project-sandbox.ts` | ✅ |
| **Tool labels humanos**: `shell → "Executando comandos"`, `fs_write → "Criando arquivo"`, etc | `tool-labels.ts` | ✅ |
| **CodeBlock**: syntax highlight + filename + copy button | `code-block.tsx` | ✅ |
| **MarkdownRenderer**: markdown com tokens `@theme` | `markdown-renderer.tsx` | ✅ |
| **ToolCallDetails**: expansível por tool (input, output, status) | `tool-call-details.tsx` | ✅ |
| Preview health probe a cada 45s com aba preview aberta | `e2b-status.ts` | ✅ |
| `forge-ui` peer dep aceita lucide-react 0.575+ (build Vercel) | `packages/forge-ui/package.json` | ✅ |

### Fase 2.7 — AgentLoop Completo + QUALIFY + Worker E2B (Commits `b14bb7d`..`d0d4dba`)
| Task | Arquivo | Status |
|------|---------|--------|
| Desativa worker E2B quebrado (versão antiga) | `agent-run/index.ts` | ✅ |
| **Arquitetura definitiva**: `agent-worker` (Edge Function) roda loop no E2B com relay de eventos | `agent-worker/index.ts` | ✅ |
| `agent_stream_events` table (Realtime) — substitui SSE direto | migration `20260606190000_agent_stream_queue.sql` | ✅ |
| `agent-queue.ts` (shared): filas PGMQ, locks, retry | `supabase/functions/_shared/agent-queue.ts` | ✅ |
| `agent-stream.ts` (shared): relay SSE ↔ Realtime events | `supabase/functions/_shared/agent-stream.ts` | ✅ |
| `run-job.ts` no `agent-run`: orquestra QUALIFY + enqueue | `agent-run/run-job.ts` | ✅ |
| **Fase QUALIFY proativa**: classifica complexidade, propõe plano, `tool_choice: required` nos primeiros 2-3 passos | `agent-run/qualify.ts`, `loop.ts` | ✅ |
| AgentLoop completo com UI de passos (não capado) | `agent-run/loop.ts` | ✅ |
| **Checkpoint resume sem reclassificar**: carrega state do banco, pula router/qualify | `agent-run/loop.ts` | ✅ |
| **Chunks inline no servidor**: até 48 steps no fallback sem PGMQ | `agent-run/index.ts` | ✅ |
| `project-sandbox` fallback (templates alternativos) | `supabase/functions/_shared/project-sandbox.ts` | ✅ |
| **Editor dropdowns amarelos**: borda/fonte Build/Plan + Integrações | `ForgeEditorDropdown.tsx`, `editor-workspace.css` | ✅ |
| **40 → 0 erros TS**: tool-icons desatualizados, `Omit<...>`, cast, `Components` react-markdown | `tool-icons.tsx`, `code-block.tsx`, `useConnectors.ts`, `markdown-renderer.tsx` | ✅ |

---

## 🎯 Frontend — O Que Falta (Gaps Reais)

### Onboarding / DX (Fase 3 — prioridade máxima)
- [ ] **Wizard 4 passos** (API Keys → Modelo → Sandbox E2B → Deploy Target) — substitui a corrida inicial confusa de settings/api/models/connectors
- [ ] **TASTE pós-setup = inexistente** (refatorar `useConnectors`/`ChatInput`/`SessionKind` pra alinhar com o conceito correto)
- [ ] **Preview Live no Chat**: iframe E2B dentro do `ChatStream` + console logs streamados (`ConsoleLogStream`)
- [ ] **Diff Visual no Stream**: `AiDiffViewer` mostra `fs_edit`/`fs_write` side-by-side (componente existe, falta integrar)
- [ ] **Skills Marketplace UI**: browse/install/rate/publish em `/skills`

### Editor / Chat
- [ ] `AiDiffViewer` integrado no `ChatStream.tsx` (existe mas não conectado)
- [ ] `AgentPanel` mostra `typecheck_fail` event (já emite, falta UI)
- [ ] Token usage / cost dashboard por run (dados existem em `token-usage.ts`)
- [ ] Replay de run (re-executar run passado com mesmo input)

### Integrações
- [ ] MCP Server Registry user-configurable (filesystem, github, postgres)
- [ ] RAG Context Assembly usando `file_embeddings` + semantic search
- [ ] Vercel/Netlify/Cloudflare deploy via `deploy_publish` tool (backend pronto, falta UI)

### Settings / Config
- [ ] `/models` page: seleção visual de preset + modo (Auto/Fixed/Robin)
- [ ] `/api-keys` page: pool Robin (add/remove keys, test connection)
- [ ] `/connectors` page: status visual (connected/error) + reconnect

---

## 📋 Fases Pendentes

### Fase 3 — DX & Onboarding (em execução)
| # | Task | Estimativa | Dependências | Status |
|---|------|------------|--------------|--------|
| 3.1 | Onboarding Wizard (4 passos) | 2 dias | `/routes/onboarding.tsx` novo + componentes step | ⏳ |
| 3.2 | TASTE pós-setup = inexistente (refatorar SessionKind → `"taste" \| "byok"`, mover `taste_chat`/`taste_start` pra actions) | 0.5 dia | `useConnectors`, `ChatInput`, `ChatStream`, `agent-run/index.ts`, `agent-run/run-job.ts` | ⏳ |
| 3.3 | Preview Live no Chat (iframe + console) | 2 dias | `E2bSandboxPanel`, `ConsoleLogStream` (NOVO), `PreviewFrame` (NOVO) | ⏳ |
| 3.4 | Diff Visual no Stream (`AiDiffViewer` integrado) | 1 dia | `ChatStream`, `AiDiffViewer`, `agent-stream.ts` | ⏳ |
| 3.5 | Skills Marketplace UI | 2 dias | `/skills` route, `project_skills` table | ⏳ |

### Fase 4 — Observabilidade & Debug
| # | Task | Estimativa | Dependências |
|---|------|------------|--------------|
| 4.1 | Agent Run Replay | 2 dias | Novo endpoint `/replay` + `loop.ts` determinístico |
| 4.2 | Token Usage & Cost Dashboard | 1 dia | `token-usage.ts` + `CostDashboard.tsx` |
| 4.3 | Structured Logging (JSON + correlation_id) | 1 dia | `index.ts`, `loop.ts`, `llm-retry.ts` |
| 4.4 | Error Resolution Hints actionable | 0.5 dia | `llm-errors.ts` + `connector-keys.ts` |
| 4.5 | Health Checks `/health` | 0.5 dia | Novo `health.ts` |

### Fase 5 — Arquitetura & Escala
| # | Task | Estimativa | Dependências |
|---|------|------------|--------------|
| 5.1 | Background Job Queue (escapa 120s) | ✅ feito | PGMQ + `agent_chunks_queue` |
| 5.2 | RAG Context Assembly | 2 dias | `file_embeddings` + `skills.ts` |
| 5.3 | MCP Server Registry | 2 dias | `mcp-forge.ts` + `connectors` table |
| 5.4 | Multi-region Edge Functions | 2 dias | Vercel/Cloudflare config |
| 5.5 | Analytics & A/B Testing | 2 dias | `editor-telemetry/` + `ab-test.ts` |

---

## 🔑 Decisões Pendentes (Precisam Input)

1. **TASTE pós-setup = inexistente**: confirmado (ver seção TASTE — Conceito acima). Refator 3.2 vai consolidar.
2. **Skills Marketplace**: Lançar com skills built-in instaláveis (privado) ou abrir para publicação comunitária dia 1?
3. **Onboarding Wizard 4 passos**: ordem confirmada `API Keys → Modelo → Sandbox E2B → Deploy Target`. Quer passo extra (ex: escolha de template inicial) ou mantém enxuto?

---

## 🚀 Próximo Comando Sugerido

```bash
# Fase 3.1 — Onboarding Wizard
# Criar: src/routes/onboarding.tsx + src/components/onboarding/{Step1ApiKeys,Step2Model,Step3Sandbox,Step4Deploy}.tsx
# Integrar em __root.tsx: redirect /onboarding se !hasCompletedOnboarding && firstVisit
# Persistir flag em profiles.onboarding_completed_at

# Fase 3.2 — Refator TASTE (em paralelo, independente)
# Editar: src/lib/taste.ts (SessionKind = "taste" | "byok")
# Editar: useConnectors.ts (expor hasUserLlmKey, tasteActions = { chat, start })
# Editar: ChatInput.tsx + ChatStream.tsx (remover "taste_chat" / "taste_start" como kind, manter como action)
# Editar: agent-run/index.ts + run-job.ts (kind = "taste" ou "byok"; taste_kind: "chat" | "start" opcional)
```

---

## 📁 Arquivos-Chave para Navegação Rápida

| Área | Arquivo |
|------|---------|
| Agent Loop Core | `supabase/functions/agent-run/loop.ts` |
| LLM Providers | `supabase/functions/agent-run/adapters/llm.ts` |
| Robin Pool | `supabase/functions/agent-run/robin-pool.ts` |
| Observer/Build | `supabase/functions/agent-run/observer.ts` |
| Prompts/Skills | `supabase/functions/agent-run/prompts.ts` + `skills.ts` |
| Router/Classifier | `supabase/functions/agent-run/router.ts` |
| QUALIFY proativa | `supabase/functions/agent-run/qualify.ts` |
| Worker E2B | `supabase/functions/agent-worker/index.ts` |
| Run orchestration | `supabase/functions/agent-run/run-job.ts` |
| Shared queue | `supabase/functions/_shared/agent-queue.ts` |
| Shared stream | `supabase/functions/_shared/agent-stream.ts` |
| **Design System (@forge/ui)** | `packages/forge-ui/src/` |
| **TASTE state** | `src/lib/taste.ts` (refator pendente — 3.2) |
| **Agent setup** | `src/lib/agent-setup.ts` |
| **Editor readiness** | `src/lib/editor-readiness.ts` |
| **Chat input** | `src/components/editor/ChatInput.tsx` |
| **Chat stream** | `src/components/editor/ChatStream.tsx` |
| **Tool labels** | `src/lib/tool-labels.ts` |
| **Code block** | `src/components/ui/code-block.tsx` |
| **Markdown renderer** | `src/components/ui/markdown-renderer.tsx` |
| **Tool call details** | `src/components/ui/tool-call-details.tsx` |
| **Diff visual** | `src/components/editor/AiDiffViewer.tsx` (não conectado) |
| Frontend Routes | `src/routes/projects/$projectId/index.tsx` |
| SSE Hook → Realtime | `src/hooks/useSSE.ts` |
| Auth | `src/lib/auth.tsx` |
| DB Schema | `supabase/migrations/20260604000000_forge_definitive.sql` |

---

*Atualizado: 2026-06-06 | Commit: 6dd81f2 | Fases 1-2.7 concluídas | Fase 3 em execução*
