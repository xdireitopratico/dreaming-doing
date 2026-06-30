# Designer Library — Move to Production (Agent Environment)

**Date:** 2026-06-30
**Status:** Approved (pending written review)
**Approach:** Big Bang — all changes delivered in one effort

---

## Problem

The Design Library feature is currently locked behind admin-only gates. It lives in the "Admin" section of the sidebar and is inaccessible to regular users. Additionally, the BrowserPreviewPanel lacks real-time interactivity (no live iframe, no thinking stream, no clickable actions, no feedback loop). The Edge Functions use hardcoded admin credentials instead of user BYOK keys. The deep extraction in vibe coding has bugs/blocks preventing execution.

## Goal

1. Move Design Library to the "Agente" section of the sidebar (alongside Skills and MCP)
2. Remove ALL admin gates from the Design Library — any authenticated user can use it
3. Fix Edge Functions to use each user's own API keys (BYOK from Conectores & API Models)
4. Rebuild BrowserPreviewPanel as a "reality show" — live iframe, thinking stream SSE, clickable LLM actions, feedback loop
5. Add user metrics dashboard
6. Debug and fix deep extraction in vibe coding
7. Complete code hygiene — remove all admin-only references that block Design Library functionality

---

## Section 1: Sidebar and Route — Desbloqueio

### Sidebar Changes (`src/components/dashboard/DashboardShell.tsx`)

- Remove the `<AdminOnly>` wrapper and the "Admin" label section
- Move "Design Library" nav link into the "Agente" section (after MCP)
- Final "Agente" section order: Skills → MCP → Design Library
- Remove `useAdmin` import from DashboardShell (if no longer used elsewhere in the file)
- Remove `AdminOnly` function definition (if no longer used elsewhere)
- Keep `NavId` type as-is (already includes `"design-library"`)

### Route Changes (`src/routes/design-library.tsx`)

- Remove the `isForgeAdminEmail` guard that redirects non-admin users
- Keep `requireAuth` and `DashboardShell` wrapper
- Keep `activeNav="design-library"`

### Files Changed

| File | Change |
|------|--------|
| `src/components/dashboard/DashboardShell.tsx` | Move Design Library to "Agente" section, remove AdminOnly, remove useAdmin import |
| `src/routes/design-library.tsx` | Remove admin gate, any authenticated user can access |

---

## Section 2: Edge Functions — BYOK and Hygiene

### 2.1 `design-dna-scheduler` (`supabase/functions/design-dna-scheduler/index.ts`)

- Remove the `isAdminEmail` check at line 156
- Accept any authenticated user (valid JWT with `userId`)
- Use `userId` from JWT as the `user_id` in the created job
- Keep service-role bypass (for Inngest executor)

### 2.2 `design-library-chat` (`supabase/functions/design-library-chat/index.ts`)

- Remove hardcoded email comparison at line 210
- Accept any authenticated user via `userId` from JWT
- **Load LLM keys from the user's own connectors** (table: `connectors`, filtered by user's `profiles.agent_preferences`)
- Reuse the LLM resolution logic from `design-dna-extraction.ts` (the `resolveLlmProvider` pattern that reads `agent_preferences` mode and falls through providers)
- Extract shared LLM resolution into `_shared/llm-resolver.ts` for reuse across Edge Functions

### 2.3 `extract-design-dna` (`supabase/functions/extract-design-dna/index.ts`)

- Check for any admin gates — if present, remove
- This is a thin proxy to the scheduler — should just pass through the user's JWT

### 2.4 `run-design-dna.ts` (`src/inngest/executor/run-design-dna.ts`)

- Already uses `agent_preferences` for LLM resolution — verify it works for any user
- Verify E2B key resolution: check if it uses admin E2B key or user's connector E2B key
  - If E2B key is admin-only, this must work via service-role (Inngest uses service-role)
  - For direct user-triggered jobs, need a platform E2B key fallback

### 2.5 Row Level Security (RLS)

Check and fix RLS policies on these tables:

| Table | Required Policies |
|-------|-------------------|
| `design_system_library` | SELECT: all authenticated users. INSERT/UPDATE/DELETE: owner or service_role |
| `design_dna_jobs` | SELECT: own jobs (user_id match). INSERT: authenticated. UPDATE/DELETE: owner or service_role |
| `design_dna_events` | SELECT: users who own the job. INSERT: service_role only |
| `design_dna_checkpoints` | All operations: service_role only (Inngest internal) |
| `design_dna_job_queue` | SELECT/INSERT/DELETE: service_role only (scheduler internal) |
| `design_library_chat_sessions` | All operations: owner (user_id match) |
| `design_library_chat_messages` | SELECT/INSERT: owner of session. INSERT: owner or service_role (for LLM messages) |

### 2.6 Shared LLM Resolver (`supabase/functions/_shared/llm-resolver.ts`)

New shared module:
- Export `resolveLlmProvider(userId)` — reads user's `agent_preferences` and `connectors`, returns provider config (protocol, model, apiKey, baseUrl)
- Supports: OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, xAI, Ollama, Perplexity
- Respects mode: auto (failover chain), robin (round-robin), fixed (specific provider)
- Used by: `design-library-chat`, `design-dna-extraction`, and any future Edge Function that needs LLM

---

## Section 3: BrowserPreviewPanel — Reality Show

### Current State

The BrowserPreviewPanel shows: static screenshots, event timeline, basic chat with LLM.

### Target State

A full-screen, 3-zone experience:

### Zone Left: Live Browser Preview (Iframe)

- **Iframe is mandatory** — no fallback to static screenshots
- Source: Chrome CDP preview URL from E2B sandbox (`meta.previewUrl` = `https://3000-{sandboxId}.e2b.app`)
- If sandbox not ready: show "Conectando ao sandbox..." spinner with status message
- If sandbox failed: show error with "Tentar novamente" button
- **Focus mode**: button to expand iframe to full screen (hides timeline and chat)
- Iframe loads with `sandbox` attribute for security (allow-same-origin, allow-scripts)

### Zone Center: Timeline + Thinking Stream

**Timeline** (maintained, improved):
- Real-time event feed from `design_dna_events` via Supabase Realtime
- Auto-scroll with toggle
- Event types with icons and color dots (existing EVENT_LABELS)
- Expandable payload view on click

**Thinking Stream** (new):
- When the LLM is processing, show streaming reasoning in real-time
- Uses SSE from the Edge Function
- Visual style: matches `ChatThinking`/`ForgeThinking` from vibe coding
- Shows: what the LLM is analyzing, navigation decisions, quality evaluations, step-by-step reasoning
- Collapsible sections (thinking blocks) similar to Claude/GPT thinking displays

### Zone Right: Chat + Clickable Actions

**Chat** (maintained, improved):
- Same visual style as vibe coding chat (forge-composer CSS)
- History persistence (already exists via DB tables)
- Enter to send, Shift+Enter for newline

**Clickable LLM Actions** (new):
- When the LLM response includes actions (navigate, screenshot, scroll, analyze), each appears as a clickable chip/button
- Clicking "Navigate to https://..." sends the action to the Edge Function, executes in sandbox, iframe updates
- Clicking "Screenshot" captures current page state, shows in preview
- Clicking "Analyze section" triggers LLM analysis with result in thinking stream
- Visual: chips styled as action cards with icon + label + params

**Feedback Loop** (new):
- After any extraction or analysis, user can type follow-up directions
- Example: "focus on the hero section", "redo with more detail", "extract color palette only"
- LLM re-executes with the new direction
- All iterative — user stays in control, LLM follows direction

### Data Flow

```
User types message
  → POST /functions/design-library-chat { jobId, message, sessionId? }
  → SSE response stream:
      - thinking chunks (reasoning)
      - reply text
      - actions array [{ type, params }]
  → UI renders:
      - Thinking stream in center zone
      - Reply in chat bubbles
      - Actions as clickable chips

User clicks action chip
  → POST /functions/design-library-chat { jobId, action: { type, params } }
  → Executes in sandbox (navigate, screenshot, scroll, analyze)
  → Returns result (screenshot URL, analysis text, page content)
  → Iframe updates (for navigate)
  → New event in timeline
  → If analysis: triggers LLM thinking stream again
```

### Edge Function Changes

**`design-library-chat` additions:**
- Support SSE streaming response (`Content-Type: text/event-stream`)
- New action: `execute-action` — receives `{ jobId, action: { type, params } }`, executes in sandbox via CDP, returns result
- Action types supported:
  - `navigate` — sends CDP navigate command to Chrome in E2B sandbox
  - `screenshot` — captures screenshot via CDP
  - `scroll` — scrolls the page via CDP
  - `analyze` — runs LLM analysis on current page content
- System prompt updated: instructs LLM to return structured actions alongside text

**New Edge Function or endpoint: `design-library-actions`**
- Dedicated endpoint for executing browser actions in the E2B sandbox
- Connects to Chrome CDP via the E2B sandbox's port 9222
- Returns screenshots, page content, or analysis results
- Authenticated by user JWT
- Uses service-role to connect to E2B (bypasses RLS for sandbox management)

---

## Section 4: User Metrics Dashboard

### Metrics Displayed

Inside the Design Library page (collapsible section at the top):

| Metric | Source | Calculation |
|--------|--------|-------------|
| Total extractions | `design_dna_jobs` | COUNT where user_id = current user |
| Avg time per extraction | `design_dna_jobs` | AVG(finished_at - started_at) for completed jobs |
| Avg quality score | `design_system_library` | AVG(quality_score) for entries from user's jobs |
| Success rate | `design_dna_jobs` | COUNT(completed) / COUNT(all) * 100 |
| Deep vs Shallow breakdown | `design_dna_jobs` | COUNT by depth, with avg quality and time per depth |
| Top categories | `design_system_library` | Top 5 categories by COUNT |
| Cost estimate | `design_dna_jobs` | Based on provider + token count (if available) |
| Recent history | `design_dna_jobs` | Last 20 jobs with status, duration, quality |

### Implementation

- New RPC: `design_library_user_metrics(p_user_id uuid)` — aggregates in Postgres
- New hook: `useUserMetrics(userId)` — calls the RPC
- UI: Collapsible metrics bar at the top of the Design Library page (below the overview badges)
- Simple CSS-based visual bars (no chart library)
- Metrics auto-refresh when jobs complete (via Realtime subscription)

---

## Section 5: Debug Deep Extraction in Vibe Coding

### Investigation Areas

1. **Tool definition**: How is `extract_design_dna` registered as an agent tool? Which Edge Function does it call? Does it have admin gates?
2. **Proxy `extract-design-dna`**: Verify it correctly passes user's JWT and doesn't block non-admin users
3. **Inngest event delivery**: Ensure `design-dna/extract.requested` event reaches the Inngest function for any user
4. **E2B sandbox creation**: `ensureDesignDnaSandbox()` — does it use admin's E2B key or can it use any E2B key from connectors?
5. **LLM resolution**: `resolveLlmProvider()` in the executor — verify it finds keys for any user
6. **RLS**: Ensure service-role (used by Inngest) bypasses RLS when writing to `design_dna_jobs`, `design_dna_events`, `design_dna_checkpoints`, `design_system_library`
7. **Tool response format**: Verify `extract_design_dna` returns `{ jobId, status }` so the agent can continue the workflow

### Expected Fixes

- Remove any residual admin gate in the `extract-design-dna` proxy
- Ensure service-role has proper permissions for all design-dna tables
- Handle E2B key resolution: if user has no E2B key, use a platform default key (stored in admin secrets or environment)
- Fix tool response format to include actionable data for the agent
- Test the full flow: user asks agent to extract → agent calls tool → job created → Inngest picks up → extraction runs → results in library → agent reads results

---

## Section 6: Code Hygiene — Remove All Admin Residual

### Search and Destroy

Search for these patterns across the entire codebase and remove/fix any that block Design Library:

| Pattern | Location | Action |
|---------|----------|--------|
| `FORGE_ADMIN_EMAIL` | `src/lib/forge-admin.ts` | Keep file (used elsewhere), but remove all references in Design Library context |
| `isForgeAdminEmail` | `src/routes/design-library.tsx`, `DashboardShell.tsx` | Remove from these files |
| `useAdmin` | `DashboardShell.tsx` | Remove import if no longer used |
| `AdminOnly` | `DashboardShell.tsx` | Remove function if no longer used |
| Hardcoded email | `design-library-chat/index.ts:210` | Replace with userId-based auth |
| `isAdminEmail` | `design-dna-scheduler/index.ts:156` | Remove |

### Sidebar Skeleton

Update `DashboardShellLoading` to not show an "Admin" nav item in the skeleton (currently shows 8 generic items — adjust to 7 or keep 8 since the Design Library is now in "Agente").

### Regression Testing

- Skills page: must continue to work unchanged
- MCP page: must continue to work unchanged
- Sidebar on mobile: must render correctly (Sheet mode)
- DashboardShell immersive mode: unaffected
- `DashboardShellLoading`: renders without errors

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    SIDEBAR                               │
│  Configuração: Api & Models, Conectores                 │
│  Agente: Skills, MCP, Designer Library  ← MOVED HERE    │
│  Projetos: Todos os projetos, Favoritos                  │
│  [NO Admin section]                                      │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              DESIGNER LIBRARY PAGE                       │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Metrics Dashboard (collapsible)                  │    │
│  │ Total: X | Avg Time: Y | Quality: Z | Rate: W% │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Overview Badges (existing)                        │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Extraction Bar (active jobs)                     │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Filters (existing)                                │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Library Grid/List (existing)                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [Click "Extrair URLs"] → CreateJobDialog              │
│  [Click active job or entry detail] →                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │        BROWSER PREVIEW PANEL (FULL SCREEN)        │    │
│  │ ┌───────────┬──────────────┬─────────────────┐    │    │
│  │ │  LIVE     │  TIMELINE +  │   CHAT +         │    │    │
│  │ │  IFRAME   │  THINKING    │   CLICKABLE      │    │    │
│  │ │  (CDP)    │  STREAM      │   ACTIONS        │    │    │
│  │ │           │              │                  │    │    │
│  │ │  Mandatory│  SSE events  │   Feedback loop   │    │    │
│  │ │  no fallback             │   Iterative      │    │    │
│  │ └───────────┴──────────────┴─────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Edge Functions Flow

```
User (JWT with userId)
  │
  ├──→ design-dna-scheduler
  │      action: "schedule"
  │      Creates job → fires Inngest event
  │      [NO admin gate]
  │
  ├──→ design-dna-scheduler
  │      action: "cancel"
  │      Cancels running job
  │
  ├──→ design-library-chat (SSE)
  │      { jobId, message, sessionId? }
  │      → Loads user's LLM keys from connectors
  │      → Streams thinking + reply + actions
  │      [NO hardcoded admin email]
  │
  └──→ design-library-actions
         { jobId, action: { type, params } }
         → Executes in E2B sandbox via CDP
         → Returns result
```

## Inngest Flow (unchanged architecture, unlocked for all users)

```
design-dna-scheduler → Inngest event "design-dna/extract.requested"
  → Inngest function "design-dna-extract"
    → check-not-canceled
    → mark-running
    → heartbeat loop
    → extract-loop (up to 3 attempts)
      → ensureDesignDnaSandbox (E2B)
      → Python agent (Playwright + Chrome CDP)
      → LLM extraction (user's BYOK keys)
      → Quality validation (score >= 5)
      → Upsert to design_system_library
    → mark-completed / mark-failed
    → drain-queue (next job)
```

## Files Changed (Complete List)

### Frontend

| File | Change Type | Description |
|------|------------|-------------|
| `src/components/dashboard/DashboardShell.tsx` | Modify | Move Design Library to "Agente", remove AdminOnly, remove useAdmin |
| `src/routes/design-library.tsx` | Modify | Remove admin gate |
| `src/components/design-library/DesignLibraryPage.tsx` | Modify | Add metrics section, improve job dialog |
| `src/components/design-library/BrowserPreviewPanel.tsx` | Rewrite | 3-zone layout: live iframe, thinking stream, clickable actions |
| `src/components/design-library/api.ts` | Modify | Add metrics RPC call, add actions API |
| `src/components/design-library/hooks.ts` | Modify | Add useUserMetrics, improve useJobEvents for thinking |
| `src/components/design-library/types.ts` | Modify | Add metrics types, action types |
| `src/lib/forge-admin.ts` | Keep | Remove references from DL context only |

### Edge Functions

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/functions/design-dna-scheduler/index.ts` | Modify | Remove admin gate |
| `supabase/functions/design-library-chat/index.ts` | Modify | Remove hardcoded email, use user BYOK, add SSE streaming, add action execution |
| `supabase/functions/extract-design-dna/index.ts` | Modify | Remove any admin gates |
| `supabase/functions/_shared/llm-resolver.ts` | New | Shared LLM provider resolution for all Edge Functions |
| `supabase/functions/design-library-actions/index.ts` | New | Dedicated endpoint for browser actions in E2B sandbox |

### Inngest / Executor

| File | Change Type | Description |
|------|------------|-------------|
| `src/inngest/executor/run-design-dna.ts` | Modify | Verify E2B key resolution for all users |
| `src/inngest/executor/design-dna-extraction.ts` | Modify | Extract resolveLlmProvider to shared, verify for all users |

### Database

| Migration | Description |
|-----------|-------------|
| New migration | RLS policies for all design-dna tables (user-based access) |
| New RPC | `design_library_user_metrics(uuid)` for metrics dashboard |

### Skills

| File | Change Type | Description |
|------|------------|-------------|
| `skills/design-system/SKILL.md` | Keep | Already works — no admin references |
| `skills/extract-design/SKILL.md` | Keep | Already works — no admin references |

---

## Non-Goals

- Not redesigning the sidebar layout (keep existing structure)
- Not adding new AI providers (use existing 10+)
- Not changing the Design Library data model (keep existing tables)
- Not adding MCP tool integration to the extraction pipeline (not selected)
- Not building a separate mobile app
