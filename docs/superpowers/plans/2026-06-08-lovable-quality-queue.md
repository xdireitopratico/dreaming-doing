# FORGE → Lovable Quality — Plan Queue

> **For agentic workers:** REQUIRED SUB-SKILL: `executing-plans` ou `subagent-driven-development`. Cada fase tem gate de verificação — **não marcar done sem evidência**.

**Goal:** Eliminar “zero vibe” e atingir paridade funcional com Lovable.dev (describe → build → preview → publish) com confiabilidade mensurável em produção.

**Architecture:** Corrigir primeiro o pipeline **plan-approve → Inngest → loop → fs_write → preview** (bugs confirmados no código). Depois fechar gates P0–P3 do `FORGE.md`. Por último, features de paridade Lovable (design guidance, visual edits, publish real).

**Tech Stack:** TanStack Start (Vercel) + Supabase (Edge + Postgres + Realtime) + Inngest (`/api/inngest`) + E2B (`preview-boot`)

**Evidence snapshot (2026-06-08):**
- Vercel prod: ● Ready — https://dreaming-doing.vercel.app (deploy 12m atrás)
- Tests: 94/94 vitest PASS; typecheck PASS; `build:vercel` PASS
- Smoke E2E: **FAIL** — FK `project_id` fixture inválido (`75490fba-...` não existe em `projects`)
- Supabase `agent_runs` (últimas 500): **497 failed** = `Chave ausente para o modelo escolhido`; 1 `awaiting_user` (qualify); 0 `pending`/`running`
- `FORGE.md` release checklist P0–P3: **todos `[ ]`**

---

## Diagnóstico: por que aprovar plano + Build não editou `App.tsx`

**Não foi culpa do usuário.** Três bugs encadeados no código:

### Bug A — Inngest não dispara no approve (P0)

| | |
|---|---|
| **Arquivo** | `src/lib/plan-decide.functions.ts:195-226` |
| **Problema** | `planApprove` envia `agent/build.requested` via `process.env.INNGEST_EVENT_KEY` no **servidor Vercel** (TanStack Start). Docs só exigem a key em **Supabase Edge** (`docs/EDGE-SECRETS.md:24`). |
| **Sintoma** | Run `pending` criada, UI mostra “aprovado”, **Inngest nunca roda**, mensagem “build na fila”. |
| **Fix** | Mover dispatch para Edge (`agent-run` action `plan_approve_build`) OU garantir `INNGEST_EVENT_KEY` no Vercel + **falhar loud** se `eventId === null`. |

### Bug B — Build run para em qualify (P0)

| | |
|---|---|
| **Arquivos** | `plan-decide.functions.ts:171-174`, `qualify.ts:33-44`, `loop.ts:358-378` |
| **Problema** | Mensagem de approve = `"Plano aprovado — executar em modo Build."` **sem** prefixo `[Plano aprovado]`. `extractOriginalUserRequest` pega essa msg (última user), não o pedido original. Texto curto → `needsQualify` → `awaiting_user` **sem tools**. |
| **Fix** | Prefixar com `PLAN_APPROVED_PREFIX`; em runs com `meta.planSourceRunId`, **bypass qualify** e usar `meta.planSummary` + steps como instruction. |

### Bug C — `setComposerMode("build")` após `watch()` falhar (P1)

| | |
|---|---|
| **Arquivo** | `useEditorPageHandlers.ts:480-487` |
| **Problema** | Se `agent.watch()` throw, cai no catch → dropdown fica em Plan. |
| **Fix** | `setComposerMode("build")` **antes** de `watch()`; `watch` em try/catch separado. |

---

## Fase 0 — Desbloqueio imediato (P0, 1–2 dias)

### Q0.1 — Fix plan-approve → build pipeline

- [ ] **Q0.1a** `plan-decide.functions.ts`: prefixar approve user msg com `PLAN_APPROVED_PREFIX` + incluir steps no texto
- [ ] **Q0.1b** `qualify.ts`: `extractOriginalUserRequest` ignora `/^Plano aprovado — executar/i` e msgs com `meta.kind === "plan_approved"` (passar meta em `buildChatHistory` ou filtrar antes)
- [ ] **Q0.1c** `loop.ts`: se `run.meta.planSourceRunId`, skip `needsQualify`; `originalUserRequest` = `planSummary` + steps
- [ ] **Q0.1d** `run-executor.ts`: runs pós-approve **force** `allocateSandbox: true` (não usar `looksLikeInteractionOnly` no texto de approve)
- [ ] **Q0.1e** Inngest dispatch: criar `POST agent-run { action: "dispatch_build", runId }` na Edge (reusa `index.ts:761-765`) e chamar de `planApprove` em vez de `fetch` local
- [ ] **Q0.1f** Se `eventId` null → `throw` no server fn (toast erro), **não** retornar `ok: true` silencioso
- [ ] **Q0.1g** `useEditorPageHandlers.ts`: reorder `setComposerMode` + resilient `watch` + sessionStorage fallback `forge:pending-build-run:{projectId}`

**Verificação:**
```bash
# Manual: Plan → approve → agent_stream_events > 0 tool_done fs_write
# Deno: qualify.test.ts + novo test extractOriginalUserRequest com approve msg
npm run test && deno test supabase/functions/agent-run/qualify.test.ts
```

### Q0.2 — INNGEST_EVENT_KEY em todos os runtimes

- [ ] Auditar: Vercel env, Supabase Edge secrets, `.env.local`
- [ ] `plan-decide` não depende de Vercel env após Q0.1e
- [ ] Adicionar health check em `/api/inngest` ou `health` edge: `inngest_configured: true/false`

### Q0.3 — Smoke E2E com fixture real

- [ ] `scripts/smoke-agent-e2e.mjs`: criar projeto+conversa temporários OU ler `SMOKE_PROJECT_ID` de env válido
- [ ] `scripts/smoke-queue-e2e.mjs`: idem
- [ ] CI job: smoke após deploy preview

**Gate Fase 0:** approve plano → `src/App.tsx` editado em < 5 min em BYOK configurado.

---

## Fase 1 — Confiabilidade “mensagem → código” (P0, 3–5 dias)

### Q1.1 — First message sempre dispara agente

- [ ] `pendingAgentRunKey` + coordinator (já parcial) — adicionar teste integração
- [ ] `handleSend` quando `isAgentBusy`: garantir fila drena (`continue_queue` smoke green)
- [ ] Telemetria: `agent_run_fail` com código (`e2b_not_configured`, `inngest_failed`, `provider_key_missing`)

### Q1.2 — Provider key failures (497/500 runs)

- [ ] **Bloquear `connect`** no frontend se prefs incompletos (já parcial em `runAgent`) — adicionar banner persistente no editor, não só toast
- [ ] Edge: não INSERT `agent_runs` se `resolveAgentProvider` falha **antes** de enqueue Inngest (evitar spam de failed runs)
- [ ] Mensagem única no chat: “Configure NVIDIA + E2B em /api” com link

### Q1.3 — Queue + drain hardening

- [ ] `continue-queue.ts`: **nunca** herdar `planMode: true` do run anterior (`agent-plan.ts` drain)
- [ ] `awaiting_user` abandonado: expirar após 24h OU botão “Continuar sem qualify”
- [ ] `loop.ts`: persistir `awaiting_user_type` na coluna DB (hoje só `meta`)

### Q1.4 — Release gates FORGE.md P0–P1 (todos green)

- [ ] P0: build + inngest + smoke-agent + smoke-queue + 0 stale runs
- [ ] P1: mensagem < 2s runId; fila 3→0; cancel não trava; awaiting_user banner

**Gate Fase 1:** `FORGE.md` P0 + P1 checkboxes ✅ com logs/screenshots.

---

## Fase 2 — Preview & sandbox (P0–P1, 4–6 dias)

### Q2.1 — Preview vivo durante build (Lovable: painel atualiza)

| Lovable | FORGE hoje | Fix |
|---------|------------|-----|
| Preview atualiza enquanto agente trabalha | `PreviewFrame` intencionalmente estático durante run | Incremental `preview_sync` a cada `file_diff` event (throttle 2s) |
| Sandbox sempre disponível | E2B expiry + “Let’s Build” | `preview-boot` keepalive + meta `previewSandboxId` TTL 45min |

- [ ] `useEditorAgentOrchestration.ts`: sync on `file_diff` not only `filesSyncKey`
- [ ] `PreviewFrame.tsx`: estado “Sincronizando…” sem flash Let's Build
- [ ] Edge `preview-boot`: probe + reconnect documentado

### Q2.2 — E2B BYOK vs managed (paridade Lovable Cloud)

- [ ] **Curto prazo:** Taste Start com E2B platform key (sem BYOK) para 1º build
- [ ] **Médio:** Lovable Cloud equivalent = Supabase + managed E2B pool

**Gate Fase 2:** Após `fs_write` em `App.tsx`, preview mostra mudança em < 30s sem reload manual.

---

## Fase 3 — Chat UX Lovable (P1, 5–7 dias)

### Q3.1 — Modos e narrativa

- [ ] Default Build (feito) — persistir preferência em localStorage
- [ ] Após approve: auto-switch Build + badge “Executando plano”
- [ ] Inventário (“o que temos?”): path dedicado (feito no loop) — teste E2E

### Q3.2 — Fila de prompts (Lovable: reorder/pause/edit)

- [ ] UI fila: listar `agent_pending_messages`, cancelar item, ver texto
- [ ] Backend: já existe — só falta UI (`ChatInput.tsx:503-511`)

### Q3.3 — `@file` no agente

- [ ] Parser em `handleSend` → injetar paths em `connect` body
- [ ] `run-job.ts`: system addon com arquivos referenciados

### Q3.4 — Visual edits (hoje stub)

- [ ] `useElementPicker` → injetar selector + snippet no composer
- [ ] Prompt addon: “editar elemento selecionado”

### Q3.5 — Design guidance (Lovable: 3 direções visuais)

- [ ] Novo phase `design_guidance` antes de primeiro `fs_write` em projeto seed
- [ ] 3 variantes HTML em tabs → user pick → build

**Gate Fase 3:** fluxo demo gravável estilo Lovable marketing (prompt → 3 opções → build → preview).

---

## Fase 4 — Publish real (P0 gap, 4–5 dias)

### Q4.1 — Publish ≠ preview URL

| | |
|---|---|
| **Hoje** | `deploy-publish-core.ts` alias `previewUrl` → `publishedUrl` |
| **Lovable** | Build produção + `*.lovable.app` + modal SEO/security |

- [ ] `deploy-publish`: trigger Vercel deploy hook / `vercel deploy --prod` com artefatos do sandbox
- [ ] Modal publish: título, descrição, favicon, access (public/private)
- [ ] Security scan básico: secrets em código, RLS check

**Gate Fase 4:** “Publicar” gera URL de produção distinta do preview E2B.

---

## Fase 5 — Verificação contínua (P0, 2–3 dias)

### Q5.1 — Playwright editor E2E

- [ ] `e2e/editor.spec.ts`: login → create project → send build → wait tool_done → preview not empty
- [ ] `e2e/plan-approve.spec.ts`: plan → approve → fs_write

### Q5.2 — CI pipeline

```yaml
# .github/workflows/release-gate.yml
- npm run test && npm run typecheck
- VERCEL=1 npm run build && npm run build:inngest
- node scripts/smoke-agent-e2e.mjs  # com fixture válido
- node scripts/check-stale-runs.mjs
```

### Q5.3 — Browser testing no agente (Lovable Build mode)

- [ ] Habilitar Playwright MCP tool em `tools/mcp-forge.ts` (hoje prompt-only)
- [ ] Observer: screenshot + console errors → auto-fix loop

---

## Matriz de paridade Lovable (35 itens — resumo)

| Rank | Gap | Prioridade |
|------|-----|------------|
| 1 | BYOK wall antes do 1º build | P0 |
| 2 | Plan approve pipeline quebrado (bugs A/B) | **P0 — você bateu aqui** |
| 3 | Release gates todos abertos | P0 |
| 4 | INNGEST / queue fragilidade | P0 |
| 5 | Publish = preview alias | P0 |
| 6 | E2B expiry UX | P0 |
| 7 | Sem design guidance (3 previews) | P1 |
| 8 | Visual edits stub | P1 |
| 9 | Sem browser testing no agente | P1 |
| 10 | Smoke E2E não green | P0 |

**Já no nível Lovable (não reimplementar):**
- Thread chat (`lovable-thread`, `ForgeAssistantBlock`)
- Realtime agent progress (`useAgentRun` + `agent_stream_events`)
- Plan modal editável (`PlanDocumentView`)
- Error hints + empty turn recovery
- File tree + Monaco + diff viewer
- Fila backend (`agent_pending_messages`)

---

## Ordem de execução (DAG)

```
Q0.1 (plan approve) ──┬──> Q1.1 (first message)
Q0.2 (inngest keys)  ──┤
Q0.3 (smoke fixture) ──┴──> Q5.2 (CI)
         │
         v
Q1.2 (provider spam) ──> Q1.3 (queue)
         │
         v
Q2.1 (preview live) ──> Q3.x (UX) ──> Q4.1 (publish)
         │
         v
Q5.1 (Playwright)
```

---

## Comandos de verificação (sempre antes de claim “done”)

```bash
cd /home/rdarienzo/Projetos/dreaming-doing
npm run test
npm run typecheck
VERCEL=1 npm run build && npm run build:inngest
deno test supabase/functions/agent-run/qualify.test.ts --allow-env
node scripts/check-stale-runs.mjs
# Após Q0.3:
node scripts/smoke-agent-e2e.mjs --project-id=<UUID válido>
vercel inspect dreaming-doing.vercel.app
```

---

## SQL debug (substituir PROJECT_ID)

```sql
-- Runs recentes
SELECT id, status, started_at, finished_at, error,
       meta->>'planSourceRunId' AS plan_build,
       meta->>'planMode' AS plan_mode
FROM agent_runs
WHERE project_id = 'PROJECT_ID'
ORDER BY started_at DESC LIMIT 20;

-- Stream events (deve crescer após approve)
SELECT event_type, count(*) FROM agent_stream_events
WHERE run_id = 'RUN_ID' GROUP BY 1;

-- Fila
SELECT * FROM agent_pending_messages WHERE project_id = 'PROJECT_ID';
```

---

## Próximo passo recomendado

**Executar Fase Q0.1 imediatamente** — é o bug que explica sua experiência (aprovou plano, Build ligado, zero `App.tsx`). Estimativa: 4–6 PRs pequenos, cada um com teste.