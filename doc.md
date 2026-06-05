# FORGE — Plano mestre unificado (Launch + código não consumido)

Documento único que cruza:

1. **Plano de Launch Lovable v3** (50 tarefas, eixos A–F) — aprovado com **canônico = `dpduljngdurfpmaclffa`**
2. **Auditoria “código pronto não consumido”** (itens `+1` … `+24`)
3. **Entrega da sessão Lovable** (commit `a41e399`, 5 jun 2026)

Ordem geral: **P0** (faça agora) → **P1** (próxima sessão de código) → **P2** (médio) → **P3** (launch / bloqueado por secrets).

Legenda de status: `✅` feito no repo · `🔄` parcial · `⏳` pendente · `🔐` precisa secret seu · `👤` só você via CLI

---

## 0. Dois Supabase (decisão aprovada)

| Ref | Papel | Quem altera daqui |
|-----|--------|-------------------|
| `mtcnwvzjfbvyiuhrqrlo` | Lovable Cloud (preview interno) | Lovable via tools |
| `dpduljngdurfpmaclffa` | **Canônico** (Vercel, CLI, `forge-supabase.ts`) | **Você** via `scripts/sync/*` |

Lovable Cloud **não desconecta**. Toda migration nova no Lovable entra no repo → você espelha na conta canônica.

**Constante no código:** `src/lib/forge-supabase.ts` → `FORGE_SUPABASE_PROJECT_REF = dpduljngdurfpmaclffa`

---

## 1. O que o Lovable entregou nesta sessão

**Commit:** `a41e399` — *Corrigiu segurança e sincroniza* (`origin/main`, merge Lovable)

**Mensagem resumida (job):**

> Fechei nesta sessão: 6 findings de segurança (B7–B12, todas marcadas como fixed), as colunas faltantes em `profiles` + `netlify` no enum, scripts de sincronização (`scripts/sync/`), e o banner do editor que avisa quando o Supabase ativo não é o canônico. As migrations só foram aplicadas no `mtcnwvzjfbvyiuhrqrlo` — rode `./scripts/sync/migrate.sh` + `./scripts/sync/deploy-all.sh` para espelhar tudo em `dpduljngdurfpmaclffa`.

### Arquivos novos/alterados (principais)

| Área | Arquivos |
|------|----------|
| Sync | `scripts/sync/README.md`, `migrate.sh`, `deploy-all.sh`, `secrets-checklist.md` |
| Segurança SQL | `supabase/migrations/20260605004720_*.sql` (B8–B11), `20260605004805_*.sql` (netlify enum + profiles) |
| Edge | `supabase/functions/mcp-server/index.ts` (auth B7) |
| UI | `src/components/SupabaseConfigBanner.tsx` (A5), `src/routes/settings.tsx` (B12) |
| Estado | `.lovable/plan.md` |

### Findings fechadas no Lovable Cloud (B7–B12) ✅

| ID | O quê |
|----|--------|
| **B7** | `mcp-server`: exige `Authorization`; tools sensíveis só admin |
| **B8** | Policy `realtime.messages` para canal `project_files-<projectId>` |
| **B9** | `deployments`: UPDATE/DELETE só owner |
| **B10** | `user_roles`: INSERT/UPDATE/DELETE negados para `authenticated` |
| **B11** | `has_role()`: REVOKE EXECUTE de `authenticated`/`anon` |
| **B12** | Admin secrets: gate via `admin-platform-secrets` `action: status` |

### Sincronização parcial (A) 🔄

| ID | Status no repo | Falta |
|----|----------------|-------|
| **A3** | ✅ `secrets-checklist.md` | 👤 conferir secrets na conta canônica |
| **A5** | ✅ banner + `console` implícito | — |
| **A1** | 🔄 doc em `scripts/sync/README.md` (comando `db diff`) | gerar `schema-diff.sql` ad-hoc |
| **A2** | ✅ `deploy-all.sh` | 👤 executar na conta canônica |
| **A6** | ✅ `migrate.sh` | 👤 executar na conta canônica |
| **A4** | ⏳ | revisar `supabase/config.toml` |

### Schema ✅ (no Lovable Cloud; espelhar na canônica)

- `connector_kind` + valor `netlify`
- `profiles.integration_prefs`, `profiles.trial_messages_remaining`

---

## 2. P0 — Ação imediata (você, antes de ler o resto)

```bash
cd /home/rdarienzo/Projetos/dreaming-doing   # ou seu clone
supabase login
supabase link --project-ref dpduljngdurfpmaclffa

./scripts/sync/migrate.sh      # A6 — aplica B8–B11 + profiles + netlify
./scripts/sync/deploy-all.sh # A2 — 9 edge functions na conta canônica
```

Depois: `scripts/sync/secrets-checklist.md` — marcar secrets no projeto canônico.

**Vercel:** confirmar `VITE_SUPABASE_URL` aponta para `https://dpduljngdurfpmaclffa.supabase.co` (banner some quando alinhado).

---

## 3. Backlog unificado (prioridade global)

Cada linha: **ID Lovable** · **ID auditoria** · status · observação · integração · onde

---

### P0 — Bloqueios de produto + paridade (esta semana)

| # | IDs | St | Por quê | Proposta | Onde |
|---|-----|-----|---------|----------|------|
| 1 | **A6, A2** | 👤 | Migrations e functions só no Lovable até rodar scripts | Executar §2 | `scripts/sync/` |
| 2 | **+1** | ⏳ | Modal “Novo projeto” chama Edge `create-project` inexistente; dashboard usa `createProjectFromPrompt` OK | Unificar em server fn; enviar `template` | `CreateProjectDialog.tsx`, `projects.functions.ts` |
| 3 | **+2**, **E36** | ⏳ | Publish hardcode `vercel`; `deploy-publish` Edge órfã | `publishProject` → `deploy-publish` ou fundir; `deployTarget` real | `publish.functions.ts`, `deploy-publish/index.ts`, editor `handlePublish` |
| 4 | **+4** | ⏳ | Slash `/deploy` sem handler | Mesmo fluxo do botão Publicar | `ChatInput.tsx`, `projects/$projectId/index.tsx` |
| 5 | **B13** | ⏳ | Rotação de service role pós-RLS | Lovable rotate + CLI canônica | Dashboard Supabase ambos refs |

---

### P1 — Agente confiável (Lovable C + auditoria +)

| # | IDs | St | Por quê | Proposta | Onde |
|---|-----|-----|---------|----------|------|
| 6 | **C14** | 🔄 | Loop já retorna `resumable: true`; UI “Continuar” incompleta | Botão no `AgentPanel` re-dispara SSE | `loop.ts`, `useSSE.ts`, `AgentPanel.tsx` |
| 7 | **C15** | ⏳ | `executionLog` só em memória | Persistir em `messages.tool_calls` / meta | `loop.ts`, tabela `messages` |
| 8 | **C19** | ⏳ | `isStuck` fraco | Hash últimos 3 tool calls | `loop.ts` ou `observer.ts` |
| 9 | **C22** | ⏳ | Abort no client; Edge segue | `runs.canceled_at` + check por step | `agent-run/index.ts` |
| 10 | **C23**, **+17** | ⏳ | Histórico sem `agent_runs` | Migration + `/history` | migration, `history.tsx`, `AuditLog.tsx` |
| 11 | **+3**, **E36–E37** | ⏳ | Tokens deploy no prompt, sem tool | `deploy_publish` tool | `agent-run/tools/deploy.ts` |
| 12 | **C16** | ⏳ | 429/529 sem backoff | Retry em `providers.ts` | `providers.ts`, `robin-pool.ts` |
| 13 | **C17** | ⏳ | Context estoura silencioso | `usage.input_tokens` → `CompressionManager` | `compression.ts`, adapters LLM |
| 14 | **C18** | ⏳ | `shell_exec` livre | Allowlist em `tools/shell.ts` | `agent-run/tools/shell.ts` |
| 15 | **C20** | ⏳ | Observer não roda build real | `tsc` + `vite build` no E2B | `observer.ts`, sandbox |
| 16 | **C21**, **+21** | ⏳ | Skills só texto; tools fake | shadcn / supabase-migration / tailwind-v4 | `skills.ts` |
| 17 | **F47** | ⏳ | Abuse de `agent-run` | Advisory lock user + max 3 runs | `agent-run/index.ts` |

---

### P1 — Editor & UX (Lovable D + componentes órfãos)

| # | IDs | St | Por quê | Proposta | Onde |
|---|-----|-----|---------|----------|------|
| 18 | **D26**, **+11** | ⏳ | Command palette existe; falta kbar + busca global | Integrar `GlobalSearch` + ações | `CommandPalette.tsx`, `GlobalSearch.tsx` |
| 19 | **D27**, **+12** | 🔄 | `AiDiffViewer` no editor; shadow workspace não | `useShadowWorkspace` + batch accept | hooks + editor |
| 20 | **D31** | ⏳ | Trace verboso | Collapse por step | `AgentPanel.tsx` |
| 21 | **+6**, **D29** | ⏳ | `PromptEnhancer` stub | `enhanceOnly` no agent-run ou remover | `PromptEnhancer.tsx`, `agent-run` |
| 22 | **+7** | ⏳ | `PlanViewer` órfão | Gate após SSE `plan` | `PlanViewer.tsx`, `useSSE.ts` |
| 23 | **+8** | ⏳ | `SnapshotsSheet` importado, não renderizado | Top bar + `useRollback` | editor route |
| 24 | **+9** | ⏳ | `RateLimitIndicator` importado, não renderizado | Trial + profile query | `EditorTopBar.tsx` |
| 25 | **D24** | 🔄 | Monaco parcial (`CodeEditor`) | Tab Code + `updateProjectFile` serverFn | `CodeEditor.tsx`, nova server fn |
| 26 | **D25** | ⏳ | File tree sem CRUD | create/rename/delete + DnD | `FileTree.tsx` |
| 27 | **D28** | ⏳ | Preview não invalida em mudança DB | Realtime `project_files` → iframe | `supabase-realtime.ts`, preview |
| 28 | **D30**, **+12** | 🔄 | `useElementPicker` existe | Screenshot + seletor no prompt | `useElementPicker.ts` |
| 29 | **D32** | ⏳ | Tema não persistido | `profiles.meta.theme` | `theme.tsx`, settings |
| 30 | **+10** | ⏳ | `GitPanel` / `StatusBar` órfãos | Rodapé + toggle git | `StatusBar.tsx`, `GitPanel.tsx` |
| 31 | **+13** | ⏳ | `AgentMemoryViewer` órfão | Drawer com eventos SSE `memory` | `AgentMemoryViewer.tsx` |
| 32 | **+14** | ⏳ | `AutoHealingPanel` órfão | Ligado a `observe` / retries | `AutoHealingPanel.tsx` |
| 33 | **+15** | ⏳ | `.forgerules` não no prompt | Ler `project_files` + `ForgeRulesEditor` | `SetupRail.tsx` |
| 34 | **+16** | ⏳ | `BranchSwitcher` órfão | Multi `conversations` | top bar |
| 35 | **+5** | ⏳ | Só seed `vite-react` | Mapa template → seeds | `src/lib/seeds/` |

---

### P2 — Integrações & deploy (Lovable E — muitos 🔐)

| # | IDs | St | Por quê | Proposta | Onde |
|---|-----|-----|---------|----------|------|
| 36 | **E33** | 🔐 | GitHub OAuth | `github-oauth-start/callback` + AES-GCM | novas edges + secrets |
| 37 | **E34** | 🔐 | Push repo usuário | `github-push` edge | após E33 |
| 38 | **E35** | 🔐 | Sync bidirecional | webhook público | `GITHUB_WEBHOOK_SECRET` |
| 39 | **E36** | 🔐 | Deploy Vercel real | edge `deploy-vercel` (hoje só preview URL) | substitui parte de +2 |
| 40 | **E37** | 🔐 | Cloudflare Pages | edge + token | conectores |
| 41 | **E38** | 🔐 | Stripe | planos + webhook | opcional launch |
| 42 | **E39**, **+20** | ⏳ | MCP UI; B7 já protege server | `/connectors` MCP + tools no agente | `mcp-server`, UI |
| 43 | **E40** | 🔄 | Multi-provider | Dropdown lê `connectors` | `EditorModelControl` |

**Nota:** `connector-upsert` já aceita `netlify` ✅; UI conectores OK. Falta **consumir** tokens no publish/deploy.

---

### P2 — Sincronização & config restante (Lovable A)

| # | IDs | St | Por quê | Proposta | Onde |
|---|-----|-----|---------|----------|------|
| 44 | **A1** | ⏳ | Diff schema entre refs | `supabase db diff --linked` → `schema-diff.sql` | `scripts/sync/` |
| 45 | **A4** | ⏳ | JWT/CORS/timeouts inconsistentes | Padronizar por function | `supabase/config.toml` |

---

### P3 — Performance, SEO, launch (Lovable F)

| # | IDs | St | Por quê | Proposta | Onde |
|---|-----|-----|---------|----------|------|
| 46 | **F41**, **+22** | ⏳ | Bundle gordo | analyze + remover deps mortas | vite, landing |
| 47 | **F42** | ⏳ | Monaco pesado | lazy import | rotas editor |
| 48 | **F43** | ⏳ | PNG na landing | WebP/SVG | `components/landing` |
| 49 | **F44** | ⏳ | SEO fraco | `head()` por rota | `routes/*` |
| 50 | **F45** | ⏳ | Sem robots/sitemap | server routes | `server.ts` |
| 51 | **F46** | ⏳ | Lighthouse | otimizar LCP/CLS | landing |
| 52 | **F48** | ⏳ | Sem audit trail app | `audit_events` + serverFn hooks | migrations |
| 53 | **F49** | 🔐 | Backup | `pg_dump` diário GH Actions | seu bucket |
| 54 | **F50** | ⏳ | Sem E2E CI | Playwright signup→preview | `.github/workflows` |

---

### P3 — Limpeza técnica (auditoria baixa prioridade)

| # | IDs | St | Proposta | Onde |
|---|-----|-----|----------|------|
| 55 | **+18** | ⏳ | Fundir ou apagar `agent-stream.ts` | `useSSE.ts` |
| 56 | **+19** | ⏳ | Remover ramo JSON morto do agent-run | `index.ts` |
| 57 | **+23** | ⏳ | CI para `e2b.test.ts` | workflows |
| 58 | **+24** | ⏳ | Consolidar `EditorRail` vs top bar | editor shell |

---

## 4. Mapa de cruzamento (auditoria ↔ plano Lovable)

| Auditoria | Equivalente Lovable | Notas |
|-----------|---------------------|--------|
| +1 create-project | — | **Não estava no plano 50**; P0 crítico |
| +2 publish / deploy-publish | E36, A2 deploy | Lovable deployou Edge; app não chama |
| +3 tool deploy | E36–E37 | |
| +4 /deploy chat | — | Quick win P0 |
| +5 seeds | D25 parcial | |
| +6 PromptEnhancer | D29 | |
| +7 PlanViewer | C14 área agente | |
| +8 Snapshots | — | |
| +9 Rate limit UI | F47 backend | |
| +10 Git panel | E33–E35 | |
| +11 GlobalSearch | D26 | |
| +12 Shadow workspace | D30 | |
| +13 Agent memory | D31 | |
| +14 Auto-healing | C20 | |
| +15 Forge rules | — | |
| +16 Branch switcher | — | |
| +17 Audit log | C23, F48 | |
| +18 agent-stream | — | limpeza |
| +19 non-SSE | — | limpeza |
| +20 mcp-server | E39, **B7 ✅** | auth feito; UI/agente pendente |
| +21 skills | C21 | |
| +22 marketing hooks | F41 | |
| +23 e2b test | F50 | |
| +24 EditorRail | D24–D32 | |

---

## 5. Edge Functions — consumo atualizado

| Function | App consome? | Plano |
|----------|--------------|--------|
| `agent-run` | ✅ SSE | C14–C22, F47 |
| `preview-boot` | ✅ fetch | política sandbox fixa |
| `project-delete` | ✅ | — |
| `connector-upsert` | ✅ | E33+ |
| `voice-transcribe` | ✅ | D29 global |
| `github-import` | ✅ | E33–E35 |
| `admin-platform-secrets` | ✅ | B12 ✅ |
| `deploy-publish` | ❌ | +2, E36 |
| `mcp-server` | ❌ (externo MCP) | B7 ✅, E39 |
| `create-project` | ❌ **sem código** | +1 remover call |

Lista deploy canônico: `scripts/sync/deploy-all.sh` (9 functions).

---

## 6. Ordem de execução recomendada (próximas sessões de código)

**Sessão 1 (você + agente):** P0 §2 scripts → P0 itens 2–4 (+1, +2, +4) → C14 UI Continuar  

**Sessão 2:** C15, C19, C22, C23 (+17) → +3 deploy tool  

**Sessão 3:** D26–D28, +8, +9, +6  

**Sessão 4:** E33–E37 quando secrets prontos  

**Sessão 5:** F41–F50 launch  

Estimativa Lovable original (~30–32/50 por sessão) **já consumiu ~12** (B7–B12, A3/A5/A6 scripts, schema, banner). Restam **~38** + **24 itens de auditoria** com overlap → **~45 trabalhos únicos** após deduplicar.

---

## 7. Fora de escopo (política fechada)

- Recriar sandbox E2B com `force` / auto-boot no abrir editor  
- Matar sandbox ao fim do turno do agente  
→ Um sandbox por projeto; kill só em `project-delete`.

---

## 8. Referências no repo

| Doc | Conteúdo |
|-----|----------|
| `.lovable/plan.md` | Estado pós-sessão Lovable (detalhe B7–B12) |
| `scripts/sync/README.md` | Fluxo duas contas |
| `scripts/sync/secrets-checklist.md` | Secrets canônicas |
| `src/lib/forge-supabase.ts` | Ref canônica |
| Este arquivo | **Plano mestre** |

---

## 9. Lista de modelos ✅ (jun/2026)

**Status:** Fase 0 concluída — 31 presets OpenRouter (#1–30 + Qwen3.5 397B).

| O quê | Arquivo |
|-------|---------|
| Catálogo UI + ranking | `src/lib/model-catalog.ts` |
| Wire Edge / agente | `supabase/functions/_shared/model-presets.ts` |
| Default | `or-anthropic--claude-sonnet-4-6` (#3) |
| Chave | `OPENROUTER_API_KEY` (conector + vault admin `platform_secrets`) |
| Pool ROBIN | `pool-groq-flash`, `pool-nemotron-super` (APIs nativas) |
| Dropdown editor | Top 12 + recomendados; lista completa em `/api-keys` → Estúdio IA |

**Próximo no doc:** Fase 1 (+1 criação projeto, +2 publish, +4 `/deploy`).

---

*Última revisão: 5 jun 2026 — merge commit `a41e399` + plano Launch v3 aprovado + auditoria +1…+24.*