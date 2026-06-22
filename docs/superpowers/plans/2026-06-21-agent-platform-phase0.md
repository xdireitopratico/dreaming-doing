# Agent Platform Phase 0 — Stop the Bleeding

> **For agentic workers:** Use subagent-driven-development or executing-plans skill task-by-task.  
> **Goal:** Produção deixa de falhar por orquestração mentirosa; smoke E2E bloqueia merge.  
> **Architecture:** Correções cirúrgicas no caminho v1 + CI gate; sem migration `agent_jobs` ainda.  
> **Horizon:** 1–2 semanas (~40h humano-equivalente)

**Parent:** [AGENT_PLATFORM_MASTER_PLAN.md](../../AGENT_PLATFORM_MASTER_PLAN.md)

---

## Task 0.1: Plan mode propaga `resumable`

**Files:**
- Modify: `supabase/functions/agent-run/loop.ts` (~1860)
- Test: `supabase/functions/agent-run/loop.test.ts`

- [x] **Step 1:** Adicionar teste Deno — plan mode budget exceeded retorna `resumable: true`
- [x] **Step 2:** Rodar teste → RED
- [x] **Step 3:** Fix return em `runPlanModeAgentTurn`:

```typescript
return {
  ok: false,
  resumable: true,
  summary: chunk.error,
  steps: chunk.steps,
  toolsUsed: chunk.toolsUsed,
  error: chunk.error,
  buildFix: chunk.buildFix,
};
```

- [x] **Step 4:** `deno test --allow-env --allow-read --allow-net supabase/functions/agent-run/loop.test.ts` → GREEN (48 passed)
- [ ] **Commit:** `fix(runtime): plan mode chunk resume propagates resumable flag`

---

## Task 0.2: Inngest re-dispatch em chunk resumable (não terminal fail)

**Files:**
- Modify: `src/inngest/functions/agent-build.ts`
- Modify: `src/inngest/functions/agent-plan.ts`
- Modify: `src/inngest/functions/_shared.ts`
- Test: `src/inngest/functions/_shared.test.ts`

**Problema:** `!final.ok && final.resumable` → `mark-failed-resumable-exhausted` sempre.

**Solução:**

- [x] **Step 1:** `resolveChunkResumeDecision` + `evaluateChunkResumptionExhausted` em `_shared.ts`

- [x] **Step 2:** Se `resumable && !exhausted`:
  - Manter `agent_runs.status = running`
  - `step.run("re-dispatch-chunk", () => inngest.send({ name: "agent/build.requested", data: { ...payload, resume: true } }))`
  - Return `{ ok: false, resumable: true, continued: true }` — **sem** `finish` terminal

- [x] **Step 3:** Se `resumable && exhausted`:
  - Mensagem honesta: `"Execução atingiu o limite de retomadas automáticas. Clique em Continuar ou envie nova mensagem."`
  - `status = failed`, `resumableExhausted: true`
  - Um único `finish`

- [x] **Step 4:** Testes Vitest `evaluateChunkResumptionExhausted` (8 passed)

- [ ] **Commit:** `fix(inngest): re-dispatch chunk instead of false terminal failure`

---

## Task 0.3: Stale detector respeita chunk handoff

**Files:**
- Modify: `supabase/functions/_shared/agent-pending-queue.ts`
- Test: `supabase/functions/_shared/agent-pending-queue.test.ts`

- [x] **Step 1:** Em `expireStaleRuns`, skip se:
  - `meta.betweenChunks === true`, OU
  - `meta.lastChunkAt` dentro de `CHUNK_HANDOFF_GAP_MS * 2`, OU
  - último evento `chunk_resume` recente

- [ ] **Step 2:** Teste Deno — run com `betweenChunks` + heartbeat velho → não expira

- [ ] **Commit:** `fix(lifecycle): stale expiry skips between-chunk runs`

---

## Task 0.4: Mensagem do loop alinhada com realidade

**Files:**
- Modify: `supabase/functions/agent-run/loop.ts` (`returnResumableChunk`)

- [x] **Step 1:** Mensagem: `"Retomando automaticamente em novo chunk…"`

- [ ] **Commit:** `fix(copy): chunk resume message matches orchestration behavior`

---

## Task 0.5: Smoke E2E no CI

**Files:**
- Modify: `.github/workflows/*` (ou criar `agent-smoke.yml`)
- Modify: `scripts/smoke-agent-e2e.mjs` — exit code 1 em falha clara

- [ ] **Step 1:** Workflow: `npm run build:inngest` + smoke com secrets staging
- [ ] **Step 2:** Documentar env vars em `docs/AGENT_RUN_STABILIZATION.md` §CI
- [ ] **Commit:** `ci: block merge on agent smoke e2e failure`

---

## Task 0.6: Deploy gate script

**Files:**
- Create: `scripts/deploy-agent-platform.sh`

- [ ] **Step 1:** Script verifica: edge deploy, `build:inngest`, vercel deploy, smoke pós-deploy
- [ ] **Commit:** `chore: agent platform deploy checklist`

---

## Verificação de saída Fase 0

```bash
# Local
deno test supabase/functions/agent-run/
npm run test -- --run
npm run build:inngest
node scripts/smoke-agent-e2e.mjs

# Produção (7 dias após deploy)
node -e "/* query failed rate < 25% */"
```

**Sign-off:** líder técnico + métricas §8 do master plan.