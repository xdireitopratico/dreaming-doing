# FORGE — opencode.md (Contexto Comprimido)

## 📍 Estado Atual
- **Branch:** `main` @ `9ba4932`
- **Deploy:** Supabase `dpduljngdurfpmaclffa` (agent-run) + Vercel (frontend)
- **Stack:** TanStack Start + React 19 + Tailwind v4 + Supabase + E2B
- **Último deploy:** Fase 2.5 concluída (Design System + Visual Features)

---

## 🧠 Learnings (O que funciona / armadilhas)

### Agent Loop (Edge Function)
| Aprendizado | Detalhe |
|-------------|---------|
| **Streaming SSE** | Funciona bem, mas `controller.close()` no catch evita memory leak |
| **Checkpoint a cada step** | `agent_checkpoints` table salva estado completo — resume real funciona |
| **Robin Pool** | 5 chaves NVIDIA/Groq: `nextKey()` retorna `null` se todas em cooldown; `timeUntilNextAvailable()` espera real |
| **Timeout Edge (120s)** | Hard limit. Solução: checkpoint forçado aos 110s + resume via `runId` |
| **Build sem deps** | `npm install` ANTES do `npm run build` no Observer resolveu 80% falhas |
| **Type-check incremental** | `tsc --noEmit file1.ts file2.ts` 10x mais rápido que projeto inteiro |
| **Rollback git** | `git reset --hard HEAD~1` após 2ª falha de build evita loop de piora |

### Frontend (TanStack Start)
| Aprendizado | Detalhe |
|-------------|---------|
| **Route Tree** | `src/routes/` + `routeTree.gen.ts` — SSR + SPA híbrido |
| **Auth** | `@lovable.dev/cloud-auth-js` + Supabase — session no `QueryClient` context |
| **SSE Hook** | `useSSE.ts` lê stream, parseia `data: {...}\n\n` — reconecta auto |
| **Preview E2B** | Iframe `https://{port}-{sandboxId}.e2b.app` — HMR funciona se Vite config `allowedHosts: true` |
| **Realtime** | `supabase.channel('project_files').on('postgres_changes'...)` — sync de arquivos no editor |

### Banco (Supabase)
| Tabela | Propósito |
|--------|-----------|
| `projects` | Core + `meta.previewSandboxId` (E2B lease 30d) |
| `agent_runs` | Histórico de execuções + `meta` (provider, model, robin, taste) |
| `agent_checkpoints` | `state` JSONB = `AgentState` serializado — resume exato |
| `agent_plans` | Planos persistidos (realtime) |
| `connectors` | `kind` + `provider` + `token_encrypted` (multi-provider) |
| `file_embeddings` | pgvector 1536 — RAG futuro |
| `skills` + `project_skills` | Marketplace skills (built-in + user) |

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

---

## 🎯 Frontend — O Que Falta (Gaps Reais)

### Onboarding / DX
- [ ] **Wizard 4 passos**: API Keys → Modelo → Sandbox E2B → Deploy Target
- [ ] **Taste Chat ilimitado** quando tem BYOK (remove limite 50/1)
- [ ] **Preview Live no Chat**: iframe E2B dentro do `ChatStream` + console logs streamados
- [ ] **Diff Visual no Stream**: `AiDiffViewer` mostra `fs_edit`/`fs_write` side-by-side
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

### Fase 3 — DX & Onboarding (Próxima)
| # | Task | Estimativa | Dependências |
|---|------|------------|--------------|
| 3.1 | Onboarding Wizard (4 steps) | 2 dias | `/routes/onboarding.tsx` novo |
| 3.2 | Taste ilimitado com BYOK | 0.5 dia | `index.ts:206-223` + `connector-llm.ts` |
| 3.3 | Preview Live no Chat (iframe + console) | 2 dias | `E2bSandboxPanel`, `PreviewFrame`, `shell.ts` |
| 3.4 | Diff Visual no Stream (`AiDiffViewer`) | 1 dia | `ChatStream`, `AiDiffViewer`, `agent-stream.ts` |
| 3.5 | Skills Marketplace UI | 2 dias | `/skills` route, `project_skills` table |

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
| 5.1 | Background Job Queue (escapa 120s) | 3 dias | `pg_cron` ou Redis + worker |
| 5.2 | RAG Context Assembly | 2 dias | `file_embeddings` + `skills.ts` |
| 5.3 | MCP Server Registry | 2 dias | `mcp-forge.ts` + `connectors` table |
| 5.4 | Multi-region Edge Functions | 2 dias | Vercel/Cloudflare config |
| 5.5 | Analytics & A/B Testing | 2 dias | `editor-telemetry/` + `ab-test.ts` |

---

## 🔑 Decisões Pendentes (Precisam Input)

1. **Background Jobs vs Chunked Runs**: Mover `agent-run` para queue (pg_cron/Redis) quebra SSE streaming. Alternativa: *chunked runs* (checkpoint a cada N steps, resume via nova invocação). Qual prefere?

2. **Design System Enforcement** — **RESOLVIDO**: Opção B implementada (@forge/ui component library + Observer enforcement + Prompt enforcement)

3. **Skills Marketplace**: Lançar com skills built-in instaláveis (privado) ou abrir para publicação comunitária dia 1?

---

## 🚀 Próximo Comando Sugerido

```bash
# Iniciar Fase 3.1 - Onboarding Wizard
# Criar: src/routes/onboarding.tsx + componentes step
# Integrar em __root.tsx (redirect se !hasCompletedOnboarding)
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
| **Design System (@forge/ui)** | `packages/forge-ui/src/` |
| Frontend Routes | `src/routes/projects/$projectId/index.tsx` |
| SSE Hook | `src/hooks/useSSE.ts` |
| Auth | `src/lib/auth.tsx` |
| DB Schema | `supabase/migrations/20260604000000_forge_definitive.sql` |

---

*Atualizado: 2026-06-06 | Commit: 9ba4932 | Fases 1-2.5 concluídas*