# Designer Library — Move to Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Design Library from admin-only to all authenticated users, fix BYOK, rebuild BrowserPreviewPanel as live reality-show, add metrics dashboard, debug deep extraction.

**Architecture:** Big Bang — all changes in one effort. Frontend (React/TanStack), Edge Functions (Deno/Supabase), Inngest executor, SQL migrations. The BrowserPreviewPanel gets a 3-zone layout (live iframe + timeline/thinking + chat/actions). Edge Functions use user's own BYOK keys from connectors. RLS policies enable per-user access.

**Tech Stack:** React, TanStack Router, Supabase (Edge Functions, RLS, Realtime, RPC), Inngest, E2B (sandboxes), Deno, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-06-30-designer-library-production-design.md`

---

## Task 1: Sidebar — Move Design Library to "Agente" Section

**Files:**
- Modify: `src/components/dashboard/DashboardShell.tsx:166-177,23-24,321-325`

- [ ] **Step 1: Remove AdminOnly wrapper and Admin section from sidebar**

In `DashboardShell.tsx`, replace the AdminOnly block (lines 166-177) with moving the Design Library link into the "Agente" section. The link should appear after MCP, before "Projetos".

Change this block:
```tsx
        <span className="dashboard-nav-label">Agente</span>
        <Link
          to="/skills"
          className="dashboard-nav-item"
          data-active={activeNav === "skills" ? "true" : undefined}
          title="Playbooks e instruções para o LLM"
          onClick={onNavClick}
        >
          <Wrench className="size-4 shrink-0" />
          Skills
        </Link>
        <Link
          to="/mcp"
          className="dashboard-nav-item"
          data-active={activeNav === "mcp" ? "true" : undefined}
          title="Servidores Model Context Protocol (ferramentas externas)"
          onClick={onNavClick}
        >
          <Puzzle className="size-4 shrink-0" />
          MCP
        </Link>

        <span className="dashboard-nav-label">Projetos</span>
```

To:
```tsx
        <span className="dashboard-nav-label">Agente</span>
        <Link
          to="/skills"
          className="dashboard-nav-item"
          data-active={activeNav === "skills" ? "true" : undefined}
          title="Playbooks e instruções para o LLM"
          onClick={onNavClick}
        >
          <Wrench className="size-4 shrink-0" />
          Skills
        </Link>
        <Link
          to="/mcp"
          className="dashboard-nav-item"
          data-active={activeNav === "mcp" ? "true" : undefined}
          title="Servidores Model Context Protocol (ferramentas externas)"
          onClick={onNavClick}
        >
          <Puzzle className="size-4 shrink-0" />
          MCP
        </Link>
        <Link
          to="/design-library"
          className="dashboard-nav-item"
          data-active={activeNav === "design-library" ? "true" : undefined}
          title="Biblioteca curada de referências de design extraídas automaticamente"
          onClick={onNavClick}
        >
          <Library className="size-4 shrink-0" />
          Designer Library
        </Link>

        <span className="dashboard-nav-label">Projetos</span>
```

Then DELETE the entire `<AdminOnly>` block (lines 166-177):
```tsx
        <AdminOnly>
          <span className="dashboard-nav-label">Admin</span>
          <Link
            to="/design-library"
            className="dashboard-nav-item"
            data-active={activeNav === "design-library" ? "true" : undefined}
            onClick={onNavClick}
          >
            <Library className="size-4 shrink-0" />
            Design Library
          </Link>
        </AdminOnly>
```

- [ ] **Step 2: Remove AdminOnly function and useAdmin import**

In `DashboardShell.tsx`:

1. Remove the `AdminOnly` function definition (lines 321-325):
```tsx
function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return null;
  return <>{children}</>;
}
```

2. Remove `useAdmin` from the import at line 24:
Change: `import { useAdmin } from "@/lib/forge-admin";`
To: (remove the entire import line if `useAdmin` is not used elsewhere in the file)

- [ ] **Step 3: Verify sidebar renders correctly**

Run: `npm run dev` (or check TypeScript compilation)
Expected: No TypeScript errors. Sidebar shows "Agente" section with Skills, MCP, Designer Library. No "Admin" section.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx
git commit -m "feat: move Designer Library to Agente section, remove AdminOnly gate"
```

---

## Task 2: Route — Remove Admin Gate

**Files:**
- Modify: `src/routes/design-library.tsx`

- [ ] **Step 1: Remove admin gate from route**

In `src/routes/design-library.tsx`, replace the entire file with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DesignLibraryPage } from "@/components/design-library";

export const Route = createFileRoute("/design-library")({
  component: DesignLibraryRoute,
});

function DesignLibraryRoute() {
  return (
    <DashboardShell requireAuth activeNav="design-library">
      <DesignLibraryPage />
    </DashboardShell>
  );
}
```

Changes: Removed `Navigate` import, removed `isForgeAdminEmail` import, removed `useAuth` import, removed the admin gate `if (!loading && !isForgeAdminEmail(...))`, removed `user` and `loading` destructuring.

- [ ] **Step 2: Verify route works**

Run: `npm run dev`
Expected: Navigating to `/design-library` as any authenticated user shows the Design Library page (not redirected to `/projects`).

- [ ] **Step 3: Commit**

```bash
git add src/routes/design-library.tsx
git commit -m "feat: remove admin gate from design-library route"
```

---

## Task 3: Edge Function — Remove Admin Gate from design-dna-scheduler

**Files:**
- Modify: `supabase/functions/design-dna-scheduler/index.ts:149-157`

- [ ] **Step 1: Remove admin email check in handleSchedule**

In `supabase/functions/design-dna-scheduler/index.ts`, in the `handleSchedule` function, find and remove this block (lines ~149-157):

```ts
  // service_role (Inngest/cron/tool interno) bypassa auth check
  const isServiceRole = !userClient;
  // Admin: email check (mesma regra do frontend via isForgeAdminEmail)
  if (!isServiceRole && !isAdminEmail(userEmail)) {
    return json({ error: "Apenas administradores podem agendar extração de DesignDNA" }, 403);
  }
```

Replace with just:
```ts
  // Any authenticated user can schedule extraction
  // service_role (Inngest/cron/tool interno) also works
```

- [ ] **Step 2: Remove unused imports/variables**

In the same file:
1. Remove the `isAdminEmail` function definition (near the top):
```ts
function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FORGE_ADMIN_EMAIL.toLowerCase();
}
```

2. Remove the `FORGE_ADMIN_EMAIL` import:
```ts
import { FORGE_ADMIN_EMAIL } from "../_shared/forge-admin.ts";
```

- [ ] **Step 3: Verify scheduler works**

Run: `supabase functions serve design-dna-scheduler` (or deploy)
Test: POST to scheduler with any authenticated user's JWT — should create job without 403.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/design-dna-scheduler/index.ts
git commit -m "feat: remove admin gate from design-dna-scheduler"
```

---

## Task 4: Edge Function — Fix design-library-chat BYOK (Remove Hardcoded Admin)

**Files:**
- Modify: `supabase/functions/design-library-chat/index.ts`

- [ ] **Step 1: Remove hardcoded email check**

In `supabase/functions/design-library-chat/index.ts`, find the hardcoded email check (around line 210) and replace it.

Change:
```ts
      if (!userId || userEmail?.toLowerCase() !== "xdireitopratico@gmail.com") {
        return new Response(JSON.stringify({ error: userId ? "Forbidden" : "Unauthorized" }), {
          status: userId ? 403 : 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
```

To:
```ts
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
```

- [ ] **Step 2: Fix BYOK to use the user's own keys**

In the same file, find the admin fallback code that searches for admin user when `targetUserId` is null. Change:

```ts
    // Carrega BYOK do admin
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 500 });
      targetUserId =
        users?.users?.find(
          (u: { email?: string; id?: string }) =>
            u.email?.toLowerCase() === "xdireitopratico@gmail.com",
        )?.id ?? null;
    }
    if (!targetUserId) {
      return new Response(
        JSON.stringify({
          reply: "Admin user não encontrado.",
          sessionId: session.id,
          jobContext: ctx,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const connectorKeys = await loadConnectorKeys(supabase as any, targetUserId);
```

To:
```ts
    // Carrega BYOK do próprio usuário
    const connectorKeys = await loadConnectorKeys(supabase as any, userId!);
```

- [ ] **Step 3: Fix error message for no API keys**

In the same file, change the "no LLM configured" error message:

From:
```ts
      const reply =
        "⚠️ Nenhuma chave LLM configurada. Adicione pelo menos uma em /api (OpenAI, Groq, OpenRouter, xAI, Gemini, DeepSeek ou Ollama).";
```

To:
```ts
      const reply =
        "⚠️ Nenhuma chave LLM configurada. Adicione pelo menos uma em Conectores & API Models (OpenAI, Groq, OpenRouter, xAI, Gemini, DeepSeek ou Ollama).";
```

- [ ] **Step 4: Verify chat works for any user**

Run: `supabase functions serve design-library-chat`
Test: POST with any authenticated user's JWT + jobId + message — should get LLM response using that user's BYOK keys.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/design-library-chat/index.ts
git commit -m "fix: remove hardcoded admin email, use user's own BYOK keys in design-library-chat"
```

---

## Task 5: SQL Migration — RLS Policies for User-Based Access

**Files:**
- Create: `supabase/migrations/YYYYMMDD_design_library_user_rls.sql`

- [ ] **Step 1: Create migration with proper RLS policies**

Create a new migration file. The existing RLS for `design_dna_jobs` already has `ddj_select_own` (SELECT: own user OR service_role). We need to ensure `design_system_library` and chat tables also have proper policies.

```sql
-- Designer Library: Enable user-based RLS for all authenticated users
-- Previously admin-only, now open to all authenticated users

-- design_system_library: All authenticated users can read; owner/service_role can write
ALTER TABLE design_system_library ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Drop existing policies if they exist (idempotent)
  DROP POLICY IF EXISTS dsl_select_all ON design_system_library;
  DROP POLICY IF EXISTS dsl_insert_service ON design_system_library;
  DROP POLICY IF EXISTS dsl_update_owner ON design_system_library;
  DROP POLICY IF EXISTS dsl_delete_owner ON design_system_library;
END $$;

CREATE POLICY dsl_select_all ON design_system_library
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY dsl_insert_service ON design_system_library
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY dsl_update_owner ON design_system_library
  FOR UPDATE USING (
    auth.role() = 'service_role'
    OR extracted_by = auth.uid()::text
  );

CREATE POLICY dsl_delete_owner ON design_system_library
  FOR DELETE USING (
    auth.role() = 'service_role'
    OR extracted_by = auth.uid()::text
  );

-- design_library_chat_sessions: owner-only access
ALTER TABLE design_library_chat_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS dlcs_select_own ON design_library_chat_sessions;
  DROP POLICY IF EXISTS dlcs_insert_own ON design_library_chat_sessions;
  DROP POLICY IF EXISTS dlcs_update_own ON design_library_chat_sessions;
  DROP POLICY IF EXISTS dlcs_delete_own ON design_library_chat_sessions;
END $$;

CREATE POLICY dlcs_select_own ON design_library_chat_sessions
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY dlcs_insert_own ON design_library_chat_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY dlcs_update_own ON design_library_chat_sessions
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY dlcs_delete_own ON design_library_chat_sessions
  FOR DELETE USING (user_id = auth.uid()::text);

-- design_library_chat_messages: owner can manage, service_role can insert LLM messages
ALTER TABLE design_library_chat_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS dlcm_select_own ON design_library_chat_messages;
  DROP POLICY IF EXISTS dlcm_insert_own ON design_library_chat_messages;
  DROP POLICY IF EXISTS dlcm_delete_own ON design_library_chat_messages;
END $$;

CREATE POLICY dlcm_select_own ON design_library_chat_messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM design_library_chat_sessions WHERE user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY dlcm_insert_own ON design_library_chat_messages
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM design_library_chat_sessions WHERE user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

CREATE POLICY dlcm_delete_own ON design_library_chat_messages
  FOR DELETE USING (
    session_id IN (SELECT id FROM design_library_chat_sessions WHERE user_id = auth.uid()::text)
    OR auth.role() = 'service_role'
  );

-- Ensure service_role bypasses RLS on all design tables
ALTER ROLE service_role BYPASSRLS;

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON design_system_library TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON design_library_chat_sessions TO authenticated;
GRANT SELECT, INSERT, DELETE ON design_library_chat_messages TO authenticated;
```

- [ ] **Step 2: Run migration**

Run: `supabase db push` or `supabase migration up`
Expected: All policies created without errors.

- [ ] **Step 3: Verify RLS works**

Test: Connect as a non-admin user. Run SELECT on `design_system_library` — should return rows. Run INSERT — should be denied (only service_role). Verify service_role can still write.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add user-based RLS policies for Design Library tables"
```

---

## Task 6: Shared LLM Resolver for Edge Functions

**Files:**
- Create: `supabase/functions/_shared/llm-resolver.ts`
- Modify: `supabase/functions/design-library-chat/index.ts`

- [ ] **Step 1: Create shared LLM resolver module**

Create `supabase/functions/_shared/llm-resolver.ts`:

```ts
/**
 * Shared LLM resolver — reads user's agent_preferences and connectors
 * to find an available LLM provider.
 *
 * Used by: design-library-chat, design-dna-scheduler, and any future Edge Function.
 */

export type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
};

type AgentPreferences = {
  mode?: "auto" | "robin" | "fixed";
  fixedPresetId?: string;
  customModelId?: string;
  userModelEntries?: Array<{ slug: string; env: string; label?: string }>;
};

/**
 * Resolve LLM config from connector keys.
 * Falls through providers in priority order (same as agent-run).
 */
export function resolveLLMFromConnectors(connectorKeys: Record<string, string>): LLMConfig | null {
  const providers: Array<{ key: string; baseUrl: string; model: string; label: string }> = [
    { key: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", label: "OpenRouter" },
    { key: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant", label: "Groq" },
    { key: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", label: "DeepSeek" },
    { key: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1", model: "grok-2-latest", label: "xAI" },
    { key: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-1.5-flash", label: "Gemini" },
    { key: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", label: "OpenAI" },
    { key: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest", label: "Anthropic" },
    { key: "PERPLEXITY_API_KEY", baseUrl: "https://api.perplexity.ai", model: "sonar", label: "Perplexity" },
  ];

  for (const p of providers) {
    if (connectorKeys[p.key]?.trim()) {
      return { apiKey: connectorKeys[p.key]!.trim(), baseUrl: p.baseUrl, model: p.model, label: p.label };
    }
  }

  // Ollama fallback
  if (connectorKeys.OLLAMA_BASE_URL?.trim()) {
    return {
      apiKey: "ollama",
      baseUrl: connectorKeys.OLLAMA_BASE_URL!.trim(),
      model: connectorKeys.OLLAMA_MODEL ?? "llama3.1",
      label: "Ollama",
    };
  }

  return null;
}
```

- [ ] **Step 2: Update design-library-chat to use shared resolver**

In `supabase/functions/design-library-chat/index.ts`:

1. Add import at the top:
```ts
import { resolveLLMFromConnectors } from "../_shared/llm-resolver.ts";
```

2. Remove the local `resolveLLMConfig` function definition entirely.

3. Replace all calls to `resolveLLMConfig(connectorKeys)` with `resolveLLMFromConnectors(connectorKeys)`.

- [ ] **Step 3: Verify shared resolver works**

Run: `supabase functions serve design-library-chat`
Test: POST with a user that has Groq key configured — should use Groq provider.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/llm-resolver.ts supabase/functions/design-library-chat/index.ts
git commit -m "feat: create shared LLM resolver, use in design-library-chat"
```

---

## Task 7: Edge Function — SSE Streaming for design-library-chat

**Files:**
- Modify: `supabase/functions/design-library-chat/index.ts`

- [ ] **Step 1: Add SSE streaming support**

In `supabase/functions/design-library-chat/index.ts`, add a new action `stream` to the main handler. The response will be `text/event-stream` instead of JSON.

After the existing `input` parsing block, add support for an `action` field in the request body:

```ts
interface ChatRequest {
  jobId: string;
  message: string;
  action?: "chat" | "stream";
}
```

When `action === "stream"` (or when the request accepts `text/event-stream`), return SSE:

```ts
    const input: ChatRequest = await req.json();
    const wantsStream = input.action === "stream" ||
      req.headers.get("Accept") === "text/event-stream";

    // ... (existing context loading code) ...

    if (wantsStream && input.message && input.message.trim()) {
      // Persist user message
      await supabase.from("design_library_chat_messages").insert({
        session_id: session!.id,
        role: "user",
        content: input.message,
      });

      // Build messages array (same as existing)
      const contextMsg = buildContextMessage(ctx);
      const messages: { role: string; content: string }[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: contextMsg },
      ];
      for (const h of history ?? []) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content as string });
        }
      }
      messages.push({ role: "user", content: input.message });

      // Stream from LLM
      const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages,
          max_tokens: 1024,
          temperature: 0.7,
          stream: true,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok || !response.body) {
        // Fallback to non-streaming
        // ... (same as existing code) ...
      }

      // SSE stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

              for (const line of lines) {
                const data = line.slice(6);
                if (data === "[DONE]") break;

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    // Send SSE event
                    controller.enqueue(
                      encoder.encode(`event: chunk\ndata: ${JSON.stringify({ content: delta })}\n\n`)
                    );
                  }
                } catch {
                  // skip malformed chunks
                }
              }
            }

            // Send done event with full content and actions
            let result: { reply: string; actions?: unknown[] };
            try {
              const parsed = JSON.parse(fullContent);
              result = { reply: parsed.reply ?? fullContent, actions: parsed.actions };
            } catch {
              result = { reply: fullContent };
            }

            controller.enqueue(
              encoder.encode(`event: done\ndata: ${JSON.stringify(result)}\n\n`)
            );

            // Persist assistant message
            await supabase.from("design_library_chat_messages").insert({
              session_id: session!.id,
              role: "assistant",
              content: result.reply,
              actions: result.actions ? (result.actions as unknown) : null,
            });
          } catch (err) {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`)
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }
```

- [ ] **Step 2: Verify SSE streaming works**

Test: POST with `action: "stream"` and check that response is `text/event-stream` with `event: chunk` and `event: done` events.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/design-library-chat/index.ts
git commit -m "feat: add SSE streaming support to design-library-chat"
```

---

## Task 8: New Edge Function — design-library-actions

**Files:**
- Create: `supabase/functions/design-library-actions/index.ts`

- [ ] **Step 1: Create design-library-actions Edge Function**

This Edge Function executes browser actions (navigate, screenshot, scroll, analyze) in the E2B sandbox via Chrome CDP.

```ts
/**
 * design-library-actions — Execute browser actions in E2B sandbox.
 *
 * Actions: navigate, screenshot, scroll, analyze
 * Auth: user JWT (userId must own the job)
 * CDP: connects to Chrome in E2B sandbox via port 9222
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const E2B_API_BASE = Deno.env.get("E2B_API_BASE") || "https://api.e2b.app";
const E2B_DOMAIN = Deno.env.get("E2B_DOMAIN") || "e2b.app";

async function getSandboxInfo(supabase: any, jobId: string) {
  const { data: job } = await supabase
    .from("design_dna_jobs")
    .select("sandbox_id, meta")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new Error("Job not found");
  const sandboxId = (job.sandbox_id as string) ?? null;
  const meta = (job.meta ?? {}) as { previewUrl?: string };
  if (!sandboxId) throw new Error("No sandbox attached to job");
  return { sandboxId, previewUrl: meta.previewUrl ?? null };
}

async function getE2bApiKey(supabase: any, userId: string): Promise<string> {
  const { data: connectors } = await supabase
    .from("connectors")
    .select("token_encrypted")
    .eq("owner_id", userId)
    .eq("kind", "e2b")
    .order("updated_at", { ascending: false })
    .limit(1);

  const row = connectors?.[0];
  if (!row) throw new Error("E2B connector not configured. Add in Conectores & API Models.");

  const raw = (row.token_encrypted as string) ?? "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as string[];
      const first = arr.find((x: string) => x.trim().length > 8);
      if (first) return first.trim();
    } catch { /* fall through */ }
  }
  if (trimmed.length > 8) return trimmed;
  throw new Error("Invalid E2B API key format");
}

async function cdpCommand(sandboxId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const wsUrl = `ws://127.0.0.1:9222`;
  // Use HTTP-based CDP instead of WebSocket for Deno simplicity
  // CDP supports HTTP via /json/send endpoint alternative
  // For Deno, we use the CDP HTTP endpoint on the E2B sandbox

  // Direct CDP via fetch to the sandbox's port
  // The E2B Connect protocol lets us run commands in the sandbox
  const E2B_API_KEY = Deno.env.get("E2B_API_KEY") ?? "";

  // Use curl-like approach: run command in sandbox that calls CDP
  // This is the pattern used by run-design-dna.ts
  return { method, params, note: "CDP command queued" };
}

async function executeInSandbox(
  sandboxId: string,
  e2bApiKey: string,
  command: string,
): Promise<{ stdout: string; stderr: string }> {
  const resp = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": e2bApiKey,
    },
    body: JSON.stringify({ code: command }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    throw new Error(`E2B connect failed: ${resp.status}`);
  }

  // Parse SSE response from E2B Connect protocol
  const text = await resp.text();
  // E2B returns binary frames; for simplicity, use stdout
  return { stdout: text, stderr: "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase: any = createClient(supabaseUrl, supabaseKey);

    const token = auth.replace(/^Bearer\s+/i, "");
    const userClient: any = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseKey,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobId, action } = await req.json();
    if (!jobId || !action) {
      return new Response(JSON.stringify({ error: "jobId and action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify job ownership
    const { data: job } = await supabase
      .from("design_dna_jobs")
      .select("id, user_id, sandbox_id, meta, status")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Allow if user owns the job OR is service_role
    const isServiceRole = token === supabaseKey;
    if (!isServiceRole && job.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sandboxId = (job.sandbox_id as string) ?? null;
    if (!sandboxId) {
      return new Response(JSON.stringify({ error: "No sandbox available for this job" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, params } = action as { type: string; params?: Record<string, unknown> };

    let result: Record<string, unknown> = {};

    switch (type) {
      case "navigate": {
        const url = (params?.url as string) ?? "";
        if (!url) {
          return new Response(JSON.stringify({ error: "url required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Execute via CDP in sandbox
        const cdpCmd = `curl -s http://127.0.0.1:9222/json/send -d '{"id":1,"method":"Page.navigate","params":{"url":"${url.replace(/"/g, '\\"')}"}}'`;
        await executeInSandbox(sandboxId, "", cdpCmd);
        result = { type: "navigated", url };
        break;
      }
      case "screenshot": {
        // Use CDP to take screenshot
        const cdpCmd = `curl -s http://127.0.0.1:9222/json/send -d '{"id":2,"method":"Page.captureScreenshot","params":{"format":"png","quality":80}}'`;
        const resp = await executeInSandbox(sandboxId, "", cdpCmd);
        result = { type: "screenshot", data: resp.stdout.slice(0, 1000) };
        break;
      }
      case "scroll": {
        const y = (params?.y as number) ?? 500;
        const jsCmd = `document.scrollTo(0, ${y})`;
        const cdpCmd = `curl -s http://127.0.0.1:9222/json/send -d '{"id":3,"method":"Runtime.evaluate","params":{"expression":"${jsCmd}"}}'`;
        await executeInSandbox(sandboxId, "", cdpCmd);
        result = { type: "scrolled", y };
        break;
      }
      case "analyze": {
        // Run LLM analysis via design-library-chat (reuse)
        const selector = (params?.selector as string) ?? "body";
        const extractCmd = `curl -s http://127.0.0.1:9222/json/send -d '{"id":4,"method":"Runtime.evaluate","params":{"expression":"document.querySelector(\\"${selector}\\")?.outerHTML?.slice(0,5000) ?? \\"element not found\\"","returnByValue":true}}'`;
        const resp = await executeInSandbox(sandboxId, "", extractCmd);
        result = { type: "analyzed", selector, snippet: resp.stdout.slice(0, 2000) };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action type: ${type}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[design-library-actions] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Verify actions Edge Function works**

Run: `supabase functions serve design-library-actions`
Test: POST with jobId + action `{ type: "navigate", params: { url: "https://stripe.com" } }`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/design-library-actions/
git commit -m "feat: create design-library-actions Edge Function for browser CDP actions"
```

---

## Task 9: BrowserPreviewPanel — Full Rewrite with Live Iframe + Thinking + Actions

**Files:**
- Rewrite: `src/components/design-library/BrowserPreviewPanel.tsx`
- Modify: `src/components/design-library/types.ts`
- Modify: `src/components/design-library/api.ts`
- Modify: `src/components/design-library/hooks.ts`

- [ ] **Step 1: Add new types for actions and metrics**

In `src/components/design-library/types.ts`, add at the end of the file:

```ts
// --- Browser Action types ---
export interface BrowserAction {
  type: "navigate" | "screenshot" | "scroll" | "analyze";
  params: Record<string, unknown>;
  label: string;
  icon: string; // emoji
}

// --- Metrics types ---
export interface UserMetrics {
  totalExtractions: number;
  avgDurationSec: number;
  avgQualityScore: number;
  successRate: number;
  deepCount: number;
  shallowCount: number;
  deepAvgQuality: number;
  shallowAvgQuality: number;
  topCategories: Array<{ category: string; count: number }>;
  recentJobs: Array<{
    id: string;
    status: string;
    depth: string;
    urls: string[];
    started_at: string;
    finished_at: string | null;
    quality_score: number | null;
  }>;
}

// --- Thinking stream types ---
export interface ThinkingChunk {
  content: string;
  timestamp: string;
}

export interface SSEEvent {
  event: "chunk" | "done" | "error";
  data: { content?: string; reply?: string; actions?: unknown[]; error?: string };
}
```

- [ ] **Step 2: Add actions API function**

In `src/components/design-library/api.ts`, add:

```ts
export async function executeBrowserAction(
  jobId: string,
  action: { type: string; params: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("design-library-actions", {
    body: { jobId, action },
  });
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>) ?? {};
}

export async function chatWithStream(
  jobId: string,
  message: string,
  sessionId?: string,
  onChunk: (chunk: string) => void,
  onDone: (reply: string, actions?: unknown[]) => void,
  onError: (error: string) => void,
): Promise<void> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/design-library-chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ jobId, message, action: "stream", sessionId }),
    },
  );

  if (!response.ok || !response.body) {
    onError(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const eventMatch = line.match(/^event: (\w+)\ndata: (.+)$/s);
      if (!eventMatch) continue;
      const [, eventType, dataStr] = eventMatch;
      try {
        const parsed = JSON.parse(dataStr);
        if (eventType === "chunk" && parsed.content) {
          onChunk(parsed.content);
        } else if (eventType === "done") {
          onDone(parsed.reply ?? "", parsed.actions);
        } else if (eventType === "error") {
          onError(parsed.error ?? "unknown");
        }
      } catch {
        // skip
      }
    }
  }
}

export async function fetchUserMetrics(): Promise<UserMetrics | null> {
  const { data, error } = await supabase.rpc("design_library_user_metrics");
  if (error) {
    console.warn("[design-library] metrics failed:", error.message);
    return null;
  }
  return (data ?? null) as UserMetrics | null;
}
```

- [ ] **Step 3: Rewrite BrowserPreviewPanel with 3-zone layout**

This is the major rewrite. The new BrowserPreviewPanel has:
- Zone Left: Live iframe (mandatory, no fallback)
- Zone Center: Timeline + Thinking stream
- Zone Right: Chat + Clickable actions

Replace the entire content of `src/components/design-library/BrowserPreviewPanel.tsx` with the new 3-zone implementation. Key structural changes:

1. **Iframe zone**: `<iframe src={previewUrl} sandbox="allow-same-origin allow-scripts" />` — shows "Conectando ao sandbox..." spinner when `previewUrl` is null and job is not terminal. Shows error with retry button if sandbox failed.

2. **Thinking stream zone**: New component `ThinkingStream` that accumulates chunks from SSE and renders them in a collapsible block styled like `forge-chat-thought-line`.

3. **Chat + Actions zone**: Chat messages rendered as before, but LLM responses with `actions` array now render each action as a clickable `<button>` with emoji icon + label. Clicking dispatches `executeBrowserAction` and refreshes iframe.

4. **Feedback loop**: After any action execution, the user can type a follow-up and the LLM receives the action result as context.

The full implementation is ~400 lines. The structure:

```tsx
export function BrowserPreviewPanel({ jobId, onClose }: BrowserPreviewPanelProps) {
  // ... existing job/events state ...

  // NEW: thinking stream state
  const [thinkingText, setThinkingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // NEW: actions state
  const [pendingActions, setPendingActions] = useState<BrowserAction[]>([]);
  const [executingAction, setExecutingAction] = useState<string | null>(null);

  // MODIFIED: use SSE for chat
  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading || !jobId) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: chatInput, timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    setIsStreaming(true);
    setThinkingText("");

    try {
      await chatWithStream(
        jobId,
        userMsg.content,
        sessionId ?? undefined,
        (chunk) => setThinkingText((prev) => prev + chunk),
        (reply, actions) => {
          setIsStreaming(false);
          setThinkingText("");
          const newMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: reply,
            timestamp: new Date().toISOString(),
            actions: actions as ChatMessage["actions"],
          };
          setChatMessages((prev) => [...prev, newMsg]);
          setChatLoading(false);
          if (actions && actions.length > 0) {
            setPendingActions(actions.map(mapToBrowserAction));
          }
        },
        (error) => {
          setIsStreaming(false);
          setChatLoading(false);
          toast.error(error);
        },
      );
    } catch (err) {
      setIsStreaming(false);
      setChatLoading(false);
      toast.error(err instanceof Error ? err.message : "Erro no chat");
    }
  }, [chatInput, chatLoading, jobId, sessionId]);

  // NEW: execute action
  const handleExecuteAction = useCallback(async (action: BrowserAction) => {
    if (!jobId || executingAction) return;
    setExecutingAction(action.type);
    try {
      await executeBrowserAction(jobId, { type: action.type, params: action.params });
      toast.success(`${action.label} executado`);
      setPendingActions((prev) => prev.filter((a) => a.type !== action.type));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar ação");
    } finally {
      setExecutingAction(null);
    }
  }, [jobId, executingAction]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      {/* Header bar (same structure, improved) */}
      <HeaderBar ... />

      {/* Progress bar (same) */}

      {/* 3-ZONE LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* ZONE LEFT: Live Iframe */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          {previewUrl && !isTerminal ? (
            <iframe
              src={previewUrl}
              className="flex-1 w-full border-0 bg-white"
              sandbox="allow-same-origin allow-scripts"
              title="Browser Preview"
            />
          ) : isTerminal ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-6">
                <p className="text-xs text-muted-foreground">
                  Job {jobStatus}. Sandbox encerrado.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-6">
                <Loader2 className="size-8 mx-auto mb-3 animate-spin text-primary" />
                <p className="text-sm font-medium">Conectando ao sandbox...</p>
                <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* ZONE CENTER: Timeline + Thinking Stream */}
        <div className="w-[280px] flex flex-col border-r border-border bg-surface-1">
          {/* Thinking Stream */}
          {isStreaming && thinkingText && (
            <div className="border-b border-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="size-3 animate-spin text-yellow-500" />
                <span className="text-[10px] font-medium text-yellow-500">Thinking</span>
              </div>
              <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                {thinkingText}
              </pre>
            </div>
          )}

          {/* Timeline (same as existing, improved) */}
          <div className="flex-1 flex flex-col">
            <TimelineHeader ... />
            <TimelineEvents ... />
          </div>
        </div>

        {/* ZONE RIGHT: Chat + Clickable Actions */}
        <div className="w-[380px] flex flex-col bg-surface-1">
          {/* Actions chips */}
          {pendingActions.length > 0 && (
            <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5">
              {pendingActions.map((action) => (
                <button
                  key={`${action.type}-${action.label}`}
                  onClick={() => handleExecuteAction(action)}
                  disabled={executingAction !== null}
                  className="text-[10px] px-2 py-1 rounded border border-primary/30 text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                  {executingAction === action.type && <Loader2 className="size-2.5 animate-spin" />}
                </button>
              ))}
            </div>
          )}

          {/* Chat messages (same structure) */}
          <ChatMessages ... />

          {/* Composer (same as existing, forge-composer style) */}
          <ChatComposer ... />
        </div>
      </div>
    </div>
  );
}
```

Helper function:
```ts
function mapToBrowserAction(a: Record<string, unknown>): BrowserAction {
  const type = (a.type as string) ?? "analyze";
  const params = (a.params as Record<string, unknown>) ?? {};
  const labels: Record<string, { label: string; icon: string }> = {
    navigate: { label: `Navigate to ${(params.url as string) ?? "..."}`, icon: "🌐" },
    screenshot: { label: "Screenshot", icon: "📸" },
    scroll: { label: `Scroll to ${(params.y as number) ?? 0}px`, icon: "⬇️" },
    analyze: { label: `Analyze ${(params.selector as string) ?? "page"}`, icon: "🧠" },
  };
  const info = labels[type] ?? { label: type, icon: "⚡" };
  return { type: type as BrowserAction["type"], params, ...info };
}
```

- [ ] **Step 4: Update exports in index.ts**

In `src/components/design-library/index.ts`, add new exports:
```ts
export { fetchUserMetrics, executeBrowserAction, chatWithStream } from "./api";
export type { UserMetrics, BrowserAction, SSEEvent, ThinkingChunk } from "./types";
```

- [ ] **Step 5: Verify BrowserPreviewPanel renders**

Run: `npm run dev`
Expected: No TypeScript errors. Panel should render the 3-zone layout when opened.

- [ ] **Step 6: Commit**

```bash
git add src/components/design-library/
git commit -m "feat: rewrite BrowserPreviewPanel with live iframe, thinking stream, clickable actions"
```

---

## Task 10: User Metrics Dashboard

**Files:**
- Create: `src/components/design-library/UserMetricsBar.tsx`
- Create: `supabase/migrations/YYYYMMDD_design_library_metrics_rpc.sql`
- Modify: `src/components/design-library/DesignLibraryPage.tsx`

- [ ] **Step 1: Create SQL RPC for user metrics**

```sql
-- RPC: design_library_user_metrics
-- Returns aggregated metrics for a specific user's design extraction jobs

CREATE OR REPLACE FUNCTION design_library_user_metrics(p_user_id uuid)
RETURNS JSON AS $$
DECLARE
  v_total INTEGER;
  v_avg_duration NUMERIC;
  v_avg_quality NUMERIC;
  v_success_count INTEGER;
  v_total_finished INTEGER;
  v_deep_count INTEGER;
  v_shallow_count INTEGER;
  v_deep_avg_quality NUMERIC;
  v_shallow_avg_quality NUMERIC;
  v_result JSONB;
BEGIN
  -- Total jobs
  SELECT COUNT(*) INTO v_total
  FROM design_dna_jobs WHERE user_id = p_user_id;

  -- Average duration (completed jobs only)
  SELECT AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))
  INTO v_avg_duration
  FROM design_dna_jobs
  WHERE user_id = p_user_id AND finished_at IS NOT NULL AND started_at IS NOT NULL;

  -- Average quality score from library entries linked to user's jobs
  SELECT COALESCE(AVG(quality_score), 0)
  INTO v_avg_quality
  FROM design_system_library
  WHERE extracted_by = p_user_id::text;

  -- Success rate
  SELECT COUNT(*) INTO v_success_count
  FROM design_dna_jobs
  WHERE user_id = p_user_id AND status = 'completed';
  SELECT COUNT(*) INTO v_total_finished
  FROM design_dna_jobs
  WHERE user_id = p_user_id AND status IN ('completed', 'failed', 'canceled', 'partial', 'blocked');

  -- Deep vs Shallow breakdown
  SELECT COUNT(*) INTO v_deep_count
  FROM design_dna_jobs WHERE user_id = p_user_id AND depth = 'deep';
  SELECT COUNT(*) INTO v_shallow_count
  FROM design_dna_jobs WHERE user_id = p_user_id AND depth = 'shallow';

  -- Average quality by depth
  SELECT COALESCE(AVG(quality_score), 0) INTO v_deep_avg_quality
  FROM design_system_library
  WHERE extracted_by = p_user_id::text AND ingest_kind IN ('production', 'curated');
  SELECT COALESCE(AVG(quality_score), 0) INTO v_shallow_avg_quality
  FROM design_system_library
  WHERE extracted_by = p_user_id::text AND ingest_kind = 'smoke';

  -- Recent jobs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'depth', depth,
    'urls', urls,
    'started_at', started_at,
    'finished_at', finished_at,
    'quality_score', NULL::numeric
  ) ORDER BY started_at DESC LIMIT 20), '[]'::jsonb)
  INTO v_result
  FROM design_dna_jobs
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'totalExtractions', v_total,
    'avgDurationSec', ROUND(COALESCE(v_avg_duration, 0)::numeric, 1),
    'avgQualityScore', ROUND(v_avg_quality::numeric, 2),
    'successRate', CASE WHEN v_total_finished > 0
      THEN ROUND((v_success_count::numeric / v_total_finished::numeric) * 100, 1)
      ELSE 0 END,
    'deepCount', v_deep_count,
    'shallowCount', v_shallow_count,
    'deepAvgQuality', ROUND(v_deep_avg_quality::numeric, 2),
    'shallowAvgQuality', ROUND(v_shallow_avg_quality::numeric, 2),
    'topCategories', '[]'::json,
    'recentJobs', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Create UserMetricsBar component**

Create `src/components/design-library/UserMetricsBar.tsx`:

```tsx
import { useState } from "react";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { fetchUserMetrics, type UserMetrics } from "./api";

export function UserMetricsBar() {
  const [expanded, setExpanded] = useState(false);
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const data = await fetchUserMetrics();
      setMetrics(data);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount
  useState(() => { void loadMetrics(); });

  if (loading) {
    return (
      <div className="px-6 pt-3">
        <div className="h-10 rounded-lg border border-border bg-surface-1 animate-pulse" />
      </div>
    );
  }

  if (!metrics || metrics.totalExtractions === 0) {
    return null;
  }

  return (
    <div className="px-6 pt-3">
      <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-2/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <BarChart3 className="size-3.5 text-primary" />
            Suas Métricas ({metrics.totalExtractions} extrações)
          </div>
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="px-3 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="Tempo médio" value={`${metrics.avgDurationSec}s`} />
              <MetricCard label="Qualidade média" value={`${metrics.avgQualityScore}/10`} />
              <MetricCard label="Taxa de sucesso" value={`${metrics.successRate}%`} />
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Profundidade</p>
                <div className="flex gap-2">
                  <span className="text-xs font-medium">Deep: {metrics.deepCount}</span>
                  <span className="text-xs font-medium">Shallow: {metrics.shallowCount}</span>
                </div>
              </div>
            </div>

            {metrics.recentJobs.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Últimos jobs</p>
                <div className="flex flex-wrap gap-1.5">
                  {metrics.recentJobs.slice(0, 5).map((j) => (
                    <span key={j.id} className="text-[10px] px-2 py-0.5 rounded border border-border bg-surface-2">
                      {j.status} · {j.depth} · {j.urls[0]?.slice(0, 20) ?? "..."}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
```

- [ ] **Step 3: Add UserMetricsBar to DesignLibraryPage**

In `src/components/design-library/DesignLibraryPage.tsx`:

1. Add import:
```tsx
import { UserMetricsBar } from "./UserMetricsBar";
```

2. Add the component after the overview section (after line ~166, before the Extraction Bar):
```tsx
      {/* User Metrics */}
      <UserMetricsBar />
```

- [ ] **Step 4: Run SQL migration**

Run: `supabase db push`
Expected: RPC function created without errors.

- [ ] **Step 5: Verify metrics display**

Run: `npm run dev`
Navigate to `/design-library` — should see collapsible metrics bar below overview.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ src/components/design-library/
git commit -m "feat: add user metrics dashboard with RPC and UserMetricsBar component"
```

---

## Task 11: Debug Deep Extraction — Investigate and Fix

**Files:**
- Modify: `supabase/functions/extract-design-dna/index.ts`
- Modify: `src/inngest/executor/run-design-dna.ts`
- Modify: `src/inngest/executor/design-dna-extraction.ts`

- [ ] **Step 1: Verify extract-design-dna proxy has no admin gate**

Read `supabase/functions/extract-design-dna/index.ts`. Verify it uses service_role to call scheduler (already does). No admin gate present — confirmed by code review. The proxy passes user JWT auth check and delegates to scheduler with service_role.

No changes needed here.

- [ ] **Step 2: Verify E2B key resolution works for any user**

In `src/inngest/executor/run-design-dna.ts`, the `executeDesignDnaJob` function loads E2B key from user's connectors:

```ts
const { data: connectors } = await serviceClient
  .from("connectors")
  .select("token_encrypted")
  .eq("owner_id", userId)
  .eq("kind", "e2b")
```

This correctly reads from the user's own connectors. If the user has no E2B key, it fails with "Configure sua chave E2B em API Keys (/api)". This is correct behavior — the user needs to add their E2B key.

**Fix needed**: The error message should reference "Conectores & API Models" instead of "/api":

Change: `const msg = "Configure sua chave E2B em API Keys (/api)";`
To: `const msg = "Configure sua chave E2B em Conectores & API Models";`

- [ ] **Step 3: Verify LLM resolution in design-dna-extraction.ts works for any user**

In `src/inngest/executor/design-dna-extraction.ts`, the `resolveLLM` function reads from user's `agent_preferences` and `connectors`. This already works for any user because:

1. It loads `agent_preferences` from `profiles` table (user-specific)
2. It loads connector keys from `connectors` table filtered by `owner_id = userId`
3. No admin gate exists in this code

No changes needed here — confirmed by code review.

- [ ] **Step 4: Verify Inngest uses service_role (bypasses RLS)**

In `src/inngest/functions/_shared-design-dna.ts`, `getSupabaseAdmin()` creates a client with `SUPABASE_SERVICE_ROLE_KEY`. This bypasses RLS. The Inngest executor uses this client for all database operations.

No changes needed — confirmed by code review.

- [ ] **Step 5: Verify tool response format for agent workflow**

Check how `extract_design_dna` tool is registered in the agent system. Search for tool definitions:

The `extract-design-dna` Edge Function returns:
```json
{ "result": { "queued": true, "async": true, "note": "...", ...schedulerData } }
```

The `schedulerData` includes `{ ok: true, jobId, eventIds }`. The agent needs the `jobId` to track progress. Verify the tool definition in the agent system returns `jobId` prominently. The current format includes it but nests it inside `result`. This should work as-is since the agent receives the full response.

- [ ] **Step 6: Fix error message and commit**

```bash
git add src/inngest/executor/run-design-dna.ts
git commit -m "fix: improve E2B key error message to reference Conectores & API Models"
```

---

## Task 12: Code Hygiene — Remove All Admin Residual

**Files:**
- Scan: All files for admin references in Design Library context

- [ ] **Step 1: Search for admin references across codebase**

Run these searches:
```
grep -r "FORGE_ADMIN_EMAIL" src/ --include="*.ts" --include="*.tsx" -l
grep -r "isForgeAdminEmail" src/ --include="*.ts" --include="*.tsx" -l
grep -r "useAdmin" src/ --include="*.ts" --include="*.tsx" -l
grep -r "AdminOnly" src/ --include="*.ts" --include="*.tsx" -l
```

Expected results:
- `FORGE_ADMIN_EMAIL` → `src/lib/forge-admin.ts` (keep — used by Prometheus admin mode)
- `isForgeAdminEmail` → `src/lib/forge-admin.ts` (keep)
- `useAdmin` → should NOT appear in DashboardShell or design-library (removed in Task 1)
- `AdminOnly` → should NOT appear anywhere in src/ (removed in Task 1)

Also search Edge Functions:
```
grep -r "xdireitopratico" supabase/functions/ -l
```

Expected: Only `_shared/forge-admin.ts` (keep) and possibly Prometheus-related files.

- [ ] **Step 2: Verify no admin gates remain in design-library components**

Check each design-library component for any admin references:
- `DesignLibraryPage.tsx` — should have none
- `DesignLibraryCard.tsx` — should have none
- `DesignLibraryDetail.tsx` — should have none
- `DesignLibraryFilters.tsx` — should have none
- `BrowserPreviewPanel.tsx` — should have none
- `api.ts` — should have none
- `hooks.ts` — should have none

If any admin references found, remove them.

- [ ] **Step 3: Verify DashboardShellLoading skeleton**

In `DashboardShell.tsx`, the loading skeleton shows 8 nav items (line 338). With Design Library moved to "Agente" (replacing the removed "Admin" section), the count stays at 8 (7 nav items + 1 separator). This is correct — no change needed.

- [ ] **Step 4: Regression test — Skills and MCP**

Run: `npm run dev`
Navigate to `/skills` — should work unchanged.
Navigate to `/mcp` — should work unchanged.
Open sidebar on mobile — should render correctly.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final code hygiene check — no admin residual in Design Library context"
```

---

## Task 13: Final Verification and Integration Test

**Files:**
- All files modified in Tasks 1-12

- [ ] **Step 1: TypeScript compilation check**

Run: `npx tsc --noEmit`
Expected: No TypeScript errors.

- [ ] **Step 2: Verify all routes work**

- `/design-library` — accessible as any user, shows Designer Library page
- `/skills` — works unchanged
- `/mcp` — works unchanged
- `/api-models` — works unchanged
- `/connectors` — works unchanged

- [ ] **Step 3: Verify sidebar structure**

Sidebar should show:
- Home
- AI Agents
- Buscar
- Configuração: Api & Models, Conectores
- **Agente: Skills, MCP, Designer Library** ← moved here
- Projetos: Todos os projetos, Favoritos
- Footer: Ajustes, Sair
- NO "Admin" section

- [ ] **Step 4: Test extraction flow**

1. Navigate to `/design-library`
2. Click "Extrair URLs"
3. Enter a URL, select "Deep" depth
4. Click "Iniciar extração"
5. Expected: Job created, BrowserPreviewPanel opens with live iframe, timeline events stream in
6. Chat with LLM should use user's BYOK keys
7. LLM actions should appear as clickable chips

- [ ] **Step 5: Test vibe coding integration**

1. Start a vibe coding session
2. Ask agent to extract design DNA from a URL
3. Expected: Agent calls extract_design_dna tool, job created without admin gate errors
4. Results should appear in Design Library

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Designer Library production-ready — all gates removed, BYOK fixed, live preview, metrics"
```

---

## Summary of All Changes

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Sidebar move | DashboardShell.tsx | Modify |
| 2 | Route gate removal | design-library.tsx (route) | Modify |
| 3 | Scheduler gate removal | design-dna-scheduler/index.ts | Modify |
| 4 | Chat BYOK fix | design-library-chat/index.ts | Modify |
| 5 | RLS policies | migration SQL | Create |
| 6 | Shared LLM resolver | _shared/llm-resolver.ts | Create |
| 7 | SSE streaming | design-library-chat/index.ts | Modify |
| 8 | Actions Edge Function | design-library-actions/ | Create |
| 9 | BrowserPreviewPanel rewrite | BrowserPreviewPanel.tsx, types.ts, api.ts, index.ts | Rewrite |
| 10 | Metrics dashboard | UserMetricsBar.tsx, migration SQL, DesignLibraryPage.tsx | Create |
| 11 | Debug deep extraction | run-design-dna.ts | Modify |
| 12 | Code hygiene | All files | Scan |
| 13 | Final verification | All | Test |
