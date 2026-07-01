# Browser Agent Autônomo para Design Library DEEP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous browser agent that controls Chrome in an E2B sandbox via CDP, streams thoughts/actions/observations to the Design Library chat, consumes user instructions, and synthesizes high-quality Design DNA in DEEP mode.

**Architecture:** The agent runs in a loop inside `run-design-dna.ts` for DEEP jobs. It uses CDP tools extracted from `design-library-actions`, an LLM planner with vision, a state manager, and a final synthesis step. User instructions are persisted in a new `design_dna_instructions` table and consumed each cycle. The frontend `BrowserPreviewPanel` renders agent events and posts instructions.

**Tech Stack:** TypeScript, Deno (Supabase Edge Functions), React/TSX, Supabase Realtime/Postgres, Inngest, E2B sandbox, Chrome DevTools Protocol.

---

## File Map

| File | Responsibility |
|------|----------------|
| `supabase/functions/agent-run/browser-cdp-tools.ts` | CDP tool implementations (navigate, screenshot, scroll, click, type, analyze, evaluate, getUrl). |
| `supabase/functions/agent-run/browser-cdp-tools.test.ts` | Unit tests for CDP tools with mocked relay responses. |
| `src/inngest/executor/browser-agent-state.ts` | Agent context, step types, state helpers. |
| `src/inngest/executor/browser-agent-state.test.ts` | Tests for state helpers. |
| `src/inngest/executor/browser-agent-llm.ts` | Prompt builder + LLM call that returns structured agent decisions. |
| `src/inngest/executor/browser-agent-llm.test.ts` | Tests for prompt building and response parsing. |
| `src/inngest/executor/browser-agent-synthesis.ts` | Final DNA synthesis from collected observations. |
| `src/inngest/executor/browser-agent-synthesis.test.ts` | Tests for synthesis with fixtures. |
| `src/inngest/executor/browser-agent-runner.ts` | Main agent loop orchestration. |
| `src/inngest/executor/browser-agent-runner.test.ts` | Tests for runner orchestration with mocked tools/LLM. |
| `src/inngest/executor/run-design-dna.ts` | Switch DEEP mode to BrowserAgentRunner; keep SHALLOW unchanged. |
| `src/components/design-library/types.ts` | Add `AgentEventType`, `Instruction` types. |
| `src/components/design-library/hooks.ts` | Add `useDesignDnaInstructions`, `usePostInstruction`. |
| `src/components/design-library/BrowserPreviewPanel.tsx` | Render agent events; send instructions to table. |
| `src/components/design-library/api.ts` | Add `postInstruction`, `fetchInstructions`. |
| `supabase/migrations/20260701_design_dna_instructions.sql` | New table + RLS + realtime publication. |
| `supabase/functions/design-library-instructions/index.ts` | Edge function to insert instruction (auth gate). |
| `docs/superpowers/specs/2026-07-01-browser-agent-deep-design.md` | Approved design spec (already written). |

---

### Task 1: Create `browser-cdp-tools.ts` module

**Files:**
- Create: `supabase/functions/agent-run/browser-cdp-tools.ts`
- Test: `supabase/functions/agent-run/browser-cdp-tools.test.ts`

**Context:** `design-library-actions/index.ts` already contains CDP wrappers (`cdpSend`, `evaluateJs`, `takeScreenshot`, `navigateTo`, `scrollPage`, `analyzeElement`). This task extracts and types them into a reusable module so the Inngest executor can call them directly.

- [ ] **Step 1: Write the failing test**

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { navigateTo, takeScreenshot, scrollPage, analyzeElement } from "./browser-cdp-tools.ts";

Deno.test("navigateTo returns success on OK relay", async () => {
  const result = await navigateTo("sb-123", "token", "https://example.com", {
    cdpSend: async () => ({ result: {} }),
  });
  assertEquals(result.success, true);
});

Deno.test("takeScreenshot returns base64 on success", async () => {
  const result = await takeScreenshot("sb-123", "token", false, {
    cdpSend: async () => ({ result: { data: "abc123" } }),
  });
  assertEquals(result.base64, "abc123");
});

Deno.test("scrollPage returns success", async () => {
  const result = await scrollPage("sb-123", "token", 500, {
    evaluateJs: async () => ({ result: "scrolled" }),
  });
  assertEquals(result.success, true);
});

Deno.test("analyzeElement extracts element data", async () => {
  const result = await analyzeElement("sb-123", "token", ".hero", {
    evaluateJs: async () => ({
      result: {
        tagName: "SECTION",
        text: "Hero text",
        html: "<section>...</section>",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        styles: { color: "rgb(0,0,0)" },
      },
    }),
  });
  assertEquals(result.tagName, "SECTION");
  assertEquals(result.text, "Hero text");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd supabase/functions/agent-run
deno test browser-cdp-tools.test.ts --allow-all
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// supabase/functions/agent-run/browser-cdp-tools.ts

const E2B_DOMAIN = Deno.env.get("E2B_DOMAIN") || "e2b.app";
const CDP_PORT = 9222;

export type CdpRelayFn = (
  sandboxId: string,
  accessToken: string | null,
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

export type EvaluateJsFn = (
  sandboxId: string,
  accessToken: string | null,
  expression: string,
) => Promise<{ result?: unknown; error?: string }>;

export async function cdpSend(
  sandboxId: string,
  accessToken: string | null,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://sandbox.${E2B_DOMAIN}/cdp`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "E2b-Sandbox-Id": sandboxId,
    "E2b-Sandbox-Port": String(CDP_PORT),
  };
  if (accessToken) headers["X-Access-Token"] = accessToken;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: 1, method, params: params ?? {} }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CDP relay ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

export async function evaluateJs(
  sandboxId: string,
  accessToken: string | null,
  expression: string,
): Promise<{ result?: unknown; error?: string }> {
  const response = await cdpSend(sandboxId, accessToken, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }) as { result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } } };

  if (response.result?.exceptionDetails) {
    return { error: response.result.exceptionDetails.text ?? "JS evaluation error" };
  }
  return { result: response.result?.result?.value };
}

export async function takeScreenshot(
  sandboxId: string,
  accessToken: string | null,
  fullPage = false,
  deps: { cdpSend?: CdpRelayFn } = {},
): Promise<{ base64: string; error?: string }> {
  const send = deps.cdpSend ?? cdpSend;
  try {
    const response = await send(sandboxId, accessToken, "Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    }) as { result?: { data?: string } };
    return { base64: response.result?.data ?? "" };
  } catch (err) {
    return { base64: "", error: (err as Error).message };
  }
}

export async function navigateTo(
  sandboxId: string,
  accessToken: string | null,
  url: string,
  deps: { cdpSend?: CdpRelayFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const send = deps.cdpSend ?? cdpSend;
  try {
    await send(sandboxId, accessToken, "Page.navigate", { url });
    await send(sandboxId, accessToken, "Page.loadEventFired", {});
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function scrollPage(
  sandboxId: string,
  accessToken: string | null,
  y: number,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    await run(sandboxId, accessToken, `window.scrollTo(0, ${y}); "scrolled"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function analyzeElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{
  tagName?: string;
  text?: string;
  html?: string;
  rect?: Record<string, unknown>;
  styles?: Record<string, string>;
  error?: string;
}> {
  const run = deps.evaluateJs ?? evaluateJs;
  const js = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: 'Element not found: ${selector.replace(/'/g, "\\'")}' };
      return {
        tagName: el.tagName,
        text: el.textContent?.slice(0, 500) || '',
        html: el.outerHTML.slice(0, 1000),
        rect: el.getBoundingClientRect(),
        styles: {
          color: getComputedStyle(el).color,
          fontSize: getComputedStyle(el).fontSize,
          fontFamily: getComputedStyle(el).fontFamily,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }
      };
    })()
  `;
  return run(sandboxId, accessToken, js) as Promise<{
    tagName?: string;
    text?: string;
    html?: string;
    rect?: Record<string, unknown>;
    styles?: Record<string, string>;
    error?: string;
  }>;
}

export async function getUrl(
  sandboxId: string,
  accessToken: string | null,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ url: string; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    const res = await run(sandboxId, accessToken, "window.location.href");
    return { url: String(res.result ?? "") };
  } catch (err) {
    return { url: "", error: (err as Error).message };
  }
}

export async function clickElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    await run(sandboxId, accessToken, `document.querySelector(${JSON.stringify(selector)})?.click(); "clicked"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function typeText(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  text: string,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    const escaped = text.replace(/"/g, '\\"');
    await run(sandboxId, accessToken, `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) { el.focus(); el.value = "${escaped}"; el.dispatchEvent(new Event('input', { bubbles: true })); }
      "typed"
    `);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd supabase/functions/agent-run
deno test browser-cdp-tools.test.ts --allow-all
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/agent-run/browser-cdp-tools.ts supabase/functions/agent-run/browser-cdp-tools.test.ts
git commit -m "feat(design-library): reusable typed CDP tools for browser agent"
```

---

### Task 2: Add agent state types and helpers

**Files:**
- Create: `src/inngest/executor/browser-agent-state.ts`
- Test: `src/inngest/executor/browser-agent-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { createAgentContext, addStep, isCycleDetected } from "./browser-agent-state";

const baseCtx = {
  jobId: "job-1",
  url: "https://example.com",
  categories: ["hero", "motion"],
  depth: "deep" as const,
  userId: "user-1",
  sandboxId: "sb-1",
  sandboxAccessToken: "token",
  maxSteps: 10,
};

describe("createAgentContext", () => {
  it("starts empty", () => {
    const ctx = createAgentContext(baseCtx);
    expect(ctx.steps).toEqual([]);
    expect(ctx.dnaPartial).toEqual({});
    expect(ctx.instructions).toEqual([]);
  });
});

describe("addStep", () => {
  it("appends a step and increments", () => {
    let ctx = createAgentContext(baseCtx);
    ctx = addStep(ctx, {
      stepNumber: 1,
      thought: "t1",
      action: { type: "navigate", params: { url: "https://example.com" } },
      observation: { type: "navigate", result: { success: true } },
      timestamp: new Date().toISOString(),
    });
    expect(ctx.steps).toHaveLength(1);
    expect(ctx.steps[0].thought).toBe("t1");
  });
});

describe("isCycleDetected", () => {
  it("detects same URL + same action 3 times", () => {
    const action = { type: "screenshot", params: {} };
    const steps = [
      { thought: "", action, observation: { url: "u1" }, timestamp: "" },
      { thought: "", action, observation: { url: "u1" }, timestamp: "" },
      { thought: "", action, observation: { url: "u1" }, timestamp: "" },
    ];
    expect(isCycleDetected(steps)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/inngest/executor/browser-agent-state.ts

export type AgentAction =
  | { type: "navigate"; params: { url: string } }
  | { type: "screenshot"; params: { fullPage?: boolean } }
  | { type: "scroll"; params: { y: number } }
  | { type: "click"; params: { selector: string } }
  | { type: "type"; params: { selector: string; text: string } }
  | { type: "analyze"; params: { selector: string } }
  | { type: "evaluate"; params: { expression: string } }
  | { type: "get_url"; params: Record<string, never> }
  | { type: "done"; params: Record<string, never> };

export type AgentObservation = {
  type: string;
  url?: string;
  result?: unknown;
  screenshot?: string;
  error?: string;
  timestamp?: string;
};

export type BrowserAgentStep = {
  stepNumber: number;
  thought: string;
  action: AgentAction;
  observation: AgentObservation;
  timestamp: string;
};

export type UserInstruction = {
  id?: string;
  role: "user" | "system";
  content: string;
  status: "pending" | "consumed" | "canceled";
  createdAt: string;
  consumedAt?: string;
};

export type BrowserAgentContext = {
  jobId: string;
  url: string;
  categories: string[];
  depth: "deep";
  userId: string;
  sandboxId: string;
  sandboxAccessToken: string | null;
  maxSteps: number;
  steps: BrowserAgentStep[];
  dnaPartial: Record<string, unknown>;
  instructions: UserInstruction[];
};

export function createAgentContext(
  init: Omit<BrowserAgentContext, "steps" | "dnaPartial" | "instructions">,
): BrowserAgentContext {
  return {
    ...init,
    steps: [],
    dnaPartial: {},
    instructions: [],
  };
}

export function addStep(
  ctx: BrowserAgentContext,
  step: BrowserAgentStep,
): BrowserAgentContext {
  return {
    ...ctx,
    steps: [...ctx.steps, step],
  };
}

export function isCycleDetected(steps: BrowserAgentStep[], threshold = 3): boolean {
  if (steps.length < threshold) return false;
  const last = steps.slice(-threshold);
  const firstUrl = last[0]?.observation?.url;
  const firstAction = JSON.stringify(last[0]?.action);
  return last.every(
    (s) =>
      s.observation?.url === firstUrl &&
      JSON.stringify(s.action) === firstAction,
  );
}

export function formatStepsForPrompt(steps: BrowserAgentStep[], limit = 10): string {
  return steps
    .slice(-limit)
    .map(
      (s) =>
        `Step ${s.stepNumber}:\nThought: ${s.thought}\nAction: ${s.action.type} ${JSON.stringify(
          s.action.params,
        )}\nObservation: ${JSON.stringify(s.observation)}`,
    )
    .join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inngest/executor/browser-agent-state.ts src/inngest/executor/browser-agent-state.test.ts
git commit -m "feat(design-library): browser agent state types and helpers"
```

---

### Task 3: Build agent LLM planner

**Files:**
- Create: `src/inngest/executor/browser-agent-llm.ts`
- Test: `src/inngest/executor/browser-agent-llm.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runAgentPlanningStep, buildAgentPrompt } from "./browser-agent-llm";
import type { BrowserAgentContext } from "./browser-agent-state";

describe("buildAgentPrompt", () => {
  it("includes objective, categories, and tools", () => {
    const ctx = {
      url: "https://example.com",
      categories: ["hero", "motion"],
      steps: [],
      instructions: [],
    } as unknown as BrowserAgentContext;
    const prompt = buildAgentPrompt(ctx);
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("hero");
    expect(prompt).toContain("motion");
    expect(prompt).toContain("navigate");
    expect(prompt).toContain("analyze");
  });
});

describe("runAgentPlanningStep", () => {
  it("returns parsed action from LLM", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        thought: "Vou tirar um screenshot do hero.",
        action: { type: "screenshot", params: { fullPage: false } },
        done: false,
      }),
    });

    const ctx = {
      url: "https://example.com",
      categories: ["hero"],
      steps: [],
      instructions: [],
      maxSteps: 10,
      sandboxId: "sb-1",
      sandboxAccessToken: "token",
    } as unknown as BrowserAgentContext;

    const result = await runAgentPlanningStep(ctx, mockLlm as any);
    expect(result.thought).toContain("screenshot");
    expect(result.action.type).toBe("screenshot");
    expect(result.done).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-llm.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/inngest/executor/browser-agent-llm.ts

import type { BrowserAgentContext, AgentAction } from "./browser-agent-state";
import { formatStepsForPrompt } from "./browser-agent-state";

export type LlmCallFn = (messages: Array<{ role: string; content: string }>) => Promise<{ content: string }>;

export type AgentPlan = {
  thought: string;
  action: AgentAction;
  done: boolean;
  dnaPartial?: Record<string, unknown>;
};

export function buildAgentPrompt(ctx: BrowserAgentContext, screenshotBase64?: string): string {
  const toolList = [
    { name: "navigate", params: { url: "string" }, use: "ir para uma URL" },
    { name: "screenshot", params: { fullPage: "boolean (opcional)" }, use: "capturar tela do viewport" },
    { name: "scroll", params: { y: "number" }, use: "scrollar para posição Y" },
    { name: "click", params: { selector: "string" }, use: "clicar em elemento" },
    { name: "type", params: { selector: "string", text: "string" }, use: "digitar em input" },
    { name: "analyze", params: { selector: "string" }, use: "extrair tag/texto/rect/styles de um elemento" },
    { name: "evaluate", params: { expression: "string" }, use: "executar JS arbitrário e retornar valor" },
    { name: "get_url", params: {}, use: "saber URL atual" },
  ];

  return `Você é um agente de design que explora sites no browser para extrair Design DNA de alta qualidade.

OBJETIVO: analisar ${ctx.url} nas categorias: ${ctx.categories.join(", ")}.

FERRAMENTAS CDP disponíveis (escolha UMA por ciclo):
${toolList.map((t) => `- ${t.name}: ${JSON.stringify(t.params)} — ${t.use}`).join("\n")}

INSTRUÇÕES DO USUÁRIO:
${ctx.instructions.filter((i) => i.status === "pending").map((i) => `- ${i.role}: ${i.content}`).join("\n") || "Nenhuma."}

HISTÓRICO DE PASSOS:
${formatStepsForPrompt(ctx.steps)}

REGRAS:
- Sempre retorne JSON válido com: thought (string), action (objeto {type, params}), done (boolean), dna_partial (opcional).
- Se já tiver evidências suficientes, use done=true e preencha dna_partial com layout, color, typography, motion, interaction, component.
- Priorize qualidade sobre velocidade. Use screenshots e analyze para confirmar observações.
- Se o usuário pediu para focar/ignorar algo, ajuste seu plano.
- NUNCA invente informação que não observou.
${screenshotBase64 ? `\nScreenshot atual em base64 anexado à mensagem do usuário.` : ""}

Responda APENAS com o JSON.`;
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const codeMatch = text.match(/\`\`\`(?:json)?\s*({[\s\S]*?})\s*\`\`\`/);
    if (codeMatch) {
      try {
        return JSON.parse(codeMatch[1]);
      } catch {
        return null;
      }
    }
    const jsonMatch = text.match(/{[\s\S]*}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAction(raw: unknown): AgentAction {
  const a = raw as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return { type: "done", params: {} };
  const type = String(a.type ?? "done");
  const params = (a.params ?? {}) as Record<string, unknown>;

  switch (type) {
    case "navigate":
      return { type: "navigate", params: { url: String(params.url ?? "") } };
    case "screenshot":
      return { type: "screenshot", params: { fullPage: params.fullPage === true } };
    case "scroll":
      return { type: "scroll", params: { y: Number(params.y ?? 0) } };
    case "click":
      return { type: "click", params: { selector: String(params.selector ?? "") } };
    case "type":
      return { type: "type", params: { selector: String(params.selector ?? ""), text: String(params.text ?? "") } };
    case "analyze":
      return { type: "analyze", params: { selector: String(params.selector ?? "") } };
    case "evaluate":
      return { type: "evaluate", params: { expression: String(params.expression ?? "") } };
    case "get_url":
      return { type: "get_url", params: {} };
    default:
      return { type: "done", params: {} };
  }
}

export async function runAgentPlanningStep(
  ctx: BrowserAgentContext,
  callLlm: LlmCallFn,
  screenshotBase64?: string,
): Promise<AgentPlan> {
  const systemPrompt = buildAgentPrompt(ctx, screenshotBase64);
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Qual o próximo passo?" },
  ];

  const response = await callLlm(messages);
  const parsed = safeJsonParse(response.content);

  if (!parsed) {
    return {
      thought: "Não foi possível parsear a resposta do LLM. Finalizando com síntese do material coletado.",
      action: { type: "done", params: {} },
      done: true,
    };
  }

  const action = normalizeAction(parsed.action);
  const done = parsed.done === true || action.type === "done";
  const dnaPartial = typeof parsed.dna_partial === "object" && parsed.dna_partial !== null
    ? (parsed.dna_partial as Record<string, unknown>)
    : undefined;

  return {
    thought: String(parsed.thought ?? ""),
    action,
    done,
    dnaPartial,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-llm.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inngest/executor/browser-agent-llm.ts src/inngest/executor/browser-agent-llm.test.ts
git commit -m "feat(design-library): LLM planner for browser agent"
```

---

### Task 4: Build agent synthesis module

**Files:**
- Create: `src/inngest/executor/browser-agent-synthesis.ts`
- Test: `src/inngest/executor/browser-agent-synthesis.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import type { BrowserAgentStep } from "./browser-agent-state";

describe("synthesizeDesignDNA", () => {
  it("calls LLM and returns parsed DNA", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        name: "Example Site",
        category: "full_page",
        layout: { hero: "full-bleed" },
        color: { primary: "#000" },
        typography: { heading: "Inter" },
        motion: { entrance: "fade-up" },
        interaction: { hover: "scale" },
        component: { hero: "HeroSignature" },
        quality_score: 9,
        quality_source: "deep_agent",
        serves_domains: ["saas"],
        compatible_languages: ["editorial"],
        compatible_moods: ["premium"],
      }),
    });

    const steps: BrowserAgentStep[] = [
      {
        stepNumber: 1,
        thought: "Hero full-bleed",
        action: { type: "screenshot", params: {} },
        observation: {
          type: "screenshot",
          url: "https://example.com",
          screenshot: "base64...",
        },
        timestamp: new Date().toISOString(),
      },
      {
        stepNumber: 2,
        thought: "Análise do hero",
        action: { type: "analyze", params: { selector: ".hero" } },
        observation: {
          type: "analyze",
          url: "https://example.com",
          result: { tagName: "SECTION", styles: { color: "#000" } },
        },
        timestamp: new Date().toISOString(),
      },
    ];

    const result = await synthesizeDesignDNA(steps, "https://example.com", ["hero"], mockLlm as any);
    expect(result.name).toBe("Example Site");
    expect(result.quality_score).toBe(9);
    expect(result.quality_source).toBe("deep_agent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-synthesis.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/inngest/executor/browser-agent-synthesis.ts

import type { BrowserAgentStep } from "./browser-agent-state";

export type SynthesizedDNA = {
  name: string;
  source_url: string;
  category: string;
  layout: Record<string, unknown> | null;
  color: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  motion: Record<string, unknown> | null;
  interaction: Record<string, unknown> | null;
  component: Record<string, unknown> | null;
  implementation_notes: string | null;
  quality_score: number;
  quality_source: string;
  serves_domains: string[];
  compatible_languages: string[];
  compatible_moods: string[];
  extracted_at: string;
};

export type LlmCallFn = (messages: Array<{ role: string; content: string }>) => Promise<{ content: string }>;

export function buildSynthesisPrompt(
  url: string,
  categories: string[],
  steps: BrowserAgentStep[],
): string {
  const evidence = steps
    .map(
      (s) =>
        `Step ${s.stepNumber}: ${s.thought}\nAction: ${s.action.type}\nObservation: ${JSON.stringify(
          s.observation,
        )}`,
    )
    .join("\n\n");

  return `Você é um síntese de Design DNA. Recebeu evidências coletadas por um agente de browser.

SITE: ${url}
CATEGORIAS SOLICITADAS: ${categories.join(", ")}

EVIDÊNCIAS:
${evidence}

TAREFA: produza UM JSON válido com:
- name: nome do site
- category: uma categoria principal
- layout, color, typography, motion, interaction, component: objetos detalhados
- implementation_notes: string com observações técnicas
- quality_score: 0-10
- quality_source: "deep_agent"
- serves_domains, compatible_languages, compatible_moods: arrays de strings

Seja específico. Cite classes, cores hex, fontes, animações observadas. Não invente o que não está nas evidências.`;
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const codeMatch = text.match(/\`\`\`(?:json)?\s*({[\s\S]*?})\s*\`\`\`/);
    if (codeMatch) {
      try {
        return JSON.parse(codeMatch[1]);
      } catch {
        return null;
      }
    }
    const jsonMatch = text.match(/{[\s\S]*}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

export async function synthesizeDesignDNA(
  steps: BrowserAgentStep[],
  url: string,
  categories: string[],
  callLlm: LlmCallFn,
): Promise<SynthesizedDNA> {
  const prompt = buildSynthesisPrompt(url, categories, steps);
  const response = await callLlm([
    { role: "system", content: prompt },
    { role: "user", content: "Sintetize o Design DNA final." },
  ]);

  const parsed = safeJsonParse(response.content) ?? {};

  const now = new Date().toISOString();
  return {
    name: String(parsed.name ?? url),
    source_url: url,
    category: String(parsed.category ?? "full_page"),
    layout: (parsed.layout as Record<string, unknown>) ?? null,
    color: (parsed.color as Record<string, unknown>) ?? null,
    typography: (parsed.typography as Record<string, unknown>) ?? null,
    motion: (parsed.motion as Record<string, unknown>) ?? null,
    interaction: (parsed.interaction as Record<string, unknown>) ?? null,
    component: (parsed.component as Record<string, unknown>) ?? null,
    implementation_notes: String(parsed.implementation_notes ?? "") || null,
    quality_score: Math.min(10, Math.max(0, Number(parsed.quality_score ?? 7))),
    quality_source: "deep_agent",
    serves_domains: Array.isArray(parsed.serves_domains) ? (parsed.serves_domains as string[]) : [],
    compatible_languages: Array.isArray(parsed.compatible_languages)
      ? (parsed.compatible_languages as string[])
      : [],
    compatible_moods: Array.isArray(parsed.compatible_moods) ? (parsed.compatible_moods as string[]) : [],
    extracted_at: now,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-synthesis.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inngest/executor/browser-agent-synthesis.ts src/inngest/executor/browser-agent-synthesis.test.ts
git commit -m "feat(design-library): synthesize Design DNA from agent observations"
```

---

### Task 5: Database migration for instructions

**Files:**
- Create: `supabase/migrations/20260701_design_dna_instructions.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260701_design_dna_instructions.sql

CREATE TABLE IF NOT EXISTS public.design_dna_instructions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.design_dna_jobs(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'system')),
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_design_dna_instructions_job_status
    ON public.design_dna_instructions(job_id, status);

-- Enable RLS
ALTER TABLE public.design_dna_instructions ENABLE ROW LEVEL SECURITY;

-- Users can see instructions for their jobs
CREATE POLICY "Users can view own instructions"
    ON public.design_dna_instructions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.design_dna_jobs j
            WHERE j.id = design_dna_instructions.job_id
              AND j.user_id = auth.uid()
        )
    );

-- Users can insert instructions for their jobs
CREATE POLICY "Users can insert own instructions"
    ON public.design_dna_instructions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.design_dna_jobs j
            WHERE j.id = design_dna_instructions.job_id
              AND j.user_id = auth.uid()
        )
    );

-- Only service role / trigger can update status
CREATE POLICY "Service role can update instruction status"
    ON public.design_dna_instructions
    FOR UPDATE
    USING (
        (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
    );

-- Realtime publication
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE public.design_dna_instructions;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260701_design_dna_instructions.sql
git commit -m "feat(design-library): design_dna_instructions table with RLS and realtime"
```

---

### Task 6: Edge function to insert instruction

**Files:**
- Create: `supabase/functions/design-library-instructions/index.ts`

- [ ] **Step 1: Write implementation**

```typescript
/**
 * design-library-instructions — Receive user instructions for a running design-dna job.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InstructionRequest {
  jobId: string;
  content: string;
  role?: "user" | "system";
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
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input: InstructionRequest = await req.json();
    if (!input.jobId || !input.content?.trim()) {
      return new Response(JSON.stringify({ error: "jobId and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await userClient
      .from("design_dna_instructions")
      .insert({
        job_id: input.jobId,
        role: input.role ?? "user",
        content: input.content.trim(),
        status: "pending",
      });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/design-library-instructions/index.ts
git commit -m "feat(design-library): edge function to post user instructions"
```

---

### Task 7: Implement agent runner loop

**Files:**
- Create: `src/inngest/executor/browser-agent-runner.ts`
- Test: `src/inngest/executor/browser-agent-runner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runBrowserAgent } from "./browser-agent-runner";
import { createAgentContext } from "./browser-agent-state";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockAppendEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../functions/_shared-design-dna", () => ({
  appendJobEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

describe("runBrowserAgent", () => {
  it("completes after agent returns done", async () => {
    const tools = {
      getUrl: vi.fn().mockResolvedValue({ url: "https://example.com" }),
      takeScreenshot: vi.fn().mockResolvedValue({ base64: "abc" }),
    };

    let step = 0;
    const planner = vi.fn().mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return Promise.resolve({
          thought: "screenshot",
          action: { type: "screenshot", params: {} },
          done: false,
        });
      }
      return Promise.resolve({
        thought: "done",
        action: { type: "done", params: {} },
        done: true,
      });
    });

    const synthesizer = vi.fn().mockResolvedValue({
      name: "Example",
      source_url: "https://example.com",
      category: "full_page",
      layout: null,
      color: null,
      typography: null,
      motion: null,
      interaction: null,
      component: null,
      implementation_notes: null,
      quality_score: 8,
      quality_source: "deep_agent",
      serves_domains: [],
      compatible_languages: [],
      compatible_moods: [],
      extracted_at: new Date().toISOString(),
    });

    const ctx = createAgentContext({
      jobId: "job-1",
      url: "https://example.com",
      categories: ["hero"],
      depth: "deep",
      userId: "user-1",
      sandboxId: "sb-1",
      sandboxAccessToken: "token",
      maxSteps: 5,
    });

    const result = await runBrowserAgent(
      ctx,
      {} as SupabaseClient,
      tools as any,
      planner as any,
      synthesizer as any,
      async () => [],
      async () => {},
    );

    expect(result.ok).toBe(true);
    expect(result.dna.quality_score).toBe(8);
    expect(planner).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-runner.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/inngest/executor/browser-agent-runner.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrowserAgentContext,
  BrowserAgentStep,
  AgentAction,
  AgentObservation,
  UserInstruction,
} from "./browser-agent-state";
import { addStep, createAgentContext, isCycleDetected } from "./browser-agent-state";
import type { AgentPlan, LlmCallFn as PlannerLlmCallFn } from "./browser-agent-llm";
import { runAgentPlanningStep } from "./browser-agent-llm";
import type { SynthesizedDNA, LlmCallFn as SynthesisLlmCallFn } from "./browser-agent-synthesis";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import { appendJobEvent } from "../functions/_shared-design-dna";
import {
  takeScreenshot,
  navigateTo,
  scrollPage,
  analyzeElement,
  getUrl,
  clickElement,
  typeText,
} from "../../../supabase/functions/agent-run/browser-cdp-tools.ts";

export type CdpTools = {
  takeScreenshot: typeof takeScreenshot;
  navigateTo: typeof navigateTo;
  scrollPage: typeof scrollPage;
  analyzeElement: typeof analyzeElement;
  getUrl: typeof getUrl;
  clickElement: typeof clickElement;
  typeText: typeof typeText;
};

export type PlannerFn = (
  ctx: BrowserAgentContext,
  screenshotBase64?: string,
) => Promise<AgentPlan>;

export type SynthesizerFn = (
  steps: BrowserAgentStep[],
  url: string,
  categories: string[],
) => Promise<SynthesizedDNA>;

export type FetchInstructionsFn = (jobId: string) => Promise<UserInstruction[]>;
export type MarkInstructionsConsumedFn = (jobId: string) => Promise<void>;

async function executeAction(
  ctx: BrowserAgentContext,
  action: AgentAction,
  tools: CdpTools,
): Promise<AgentObservation> {
  const ts = new Date().toISOString();
  const currentUrl = await tools.getUrl(ctx.sandboxId, ctx.sandboxAccessToken);

  switch (action.type) {
    case "navigate": {
      const res = await tools.navigateTo(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.url,
      );
      return { type: "navigate", url: action.params.url, result: res, timestamp: ts };
    }
    case "screenshot": {
      const res = await tools.takeScreenshot(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.fullPage,
      );
      return { type: "screenshot", url: currentUrl.url, screenshot: res.base64, result: res, timestamp: ts };
    }
    case "scroll": {
      const res = await tools.scrollPage(ctx.sandboxId, ctx.sandboxAccessToken, action.params.y);
      return { type: "scroll", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "click": {
      const res = await tools.clickElement(ctx.sandboxId, ctx.sandboxAccessToken, action.params.selector);
      return { type: "click", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "type": {
      const res = await tools.typeText(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.selector,
        action.params.text,
      );
      return { type: "type", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "analyze": {
      const res = await tools.analyzeElement(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.selector,
      );
      return { type: "analyze", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "evaluate": {
      const { result, error } = await tools.evaluateJs(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.expression,
      );
      return { type: "evaluate", url: currentUrl.url, result, error, timestamp: ts };
    }
    case "get_url": {
      return { type: "get_url", url: currentUrl.url, result: currentUrl, timestamp: ts };
    }
    case "done":
    default:
      return { type: "done", url: currentUrl.url, result: {}, timestamp: ts };
  }
}

export async function runBrowserAgent(
  initialCtx: BrowserAgentContext,
  supabase: SupabaseClient,
  tools: CdpTools,
  planner: PlannerFn,
  synthesizer: SynthesizerFn,
  fetchInstructions: FetchInstructionsFn,
  markConsumed: MarkInstructionsConsumedFn,
): Promise<
  { ok: true; dna: SynthesizedDNA; steps: BrowserAgentStep[] } | { ok: false; error: string }
> {
  let ctx = initialCtx;

  try {
    for (let stepNumber = 1; stepNumber <= ctx.maxSteps; stepNumber++) {
      const instructions = await fetchInstructions(ctx.jobId);
      if (instructions.length > 0) {
        ctx = { ...ctx, instructions };
        await markConsumed(ctx.jobId);
      }

      // Capture screenshot for planner vision
      const shot = await tools.takeScreenshot(ctx.sandboxId, ctx.sandboxAccessToken, false).catch(() => ({ base64: "" }));
      const screenshotBase64 = shot.base64 ? `data:image/png;base64,${shot.base64}` : undefined;

      const plan = await planner(ctx, screenshotBase64);

      await appendJobEvent(supabase, ctx.jobId, "agent_thought", {
        step: stepNumber,
        thought: plan.thought,
      });
      await appendJobEvent(supabase, ctx.jobId, "agent_action", {
        step: stepNumber,
        action: plan.action,
      });

      const observation = await executeAction(ctx, plan.action, tools);

      await appendJobEvent(supabase, ctx.jobId, "agent_observation", {
        step: stepNumber,
        observation,
      });

      const step: BrowserAgentStep = {
        stepNumber,
        thought: plan.thought,
        action: plan.action,
        observation,
        timestamp: new Date().toISOString(),
      };

      ctx = addStep(ctx, step);

      if (plan.dnaPartial && Object.keys(plan.dnaPartial).length > 0) {
        ctx = { ...ctx, dnaPartial: { ...ctx.dnaPartial, ...plan.dnaPartial } };
      }

      if (plan.done || isCycleDetected(ctx.steps, 3)) {
        break;
      }
    }

    const dna = await synthesizer(ctx.steps, ctx.url, ctx.categories);
    await appendJobEvent(supabase, ctx.jobId, "agent_done", { dnaSummary: dna.name });

    return { ok: true, dna, steps: ctx.steps };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendJobEvent(supabase, ctx.jobId, "agent_error", { error: msg });
    return { ok: false, error: msg };
  }
}

export function createDefaultCdpTools(): CdpTools {
  return {
    takeScreenshot,
    navigateTo,
    scrollPage,
    analyzeElement,
    getUrl,
    clickElement,
    typeText,
  };
}
```

Note: `evaluateJs` is imported from `browser-cdp-tools.ts`; ensure it is exported. Add to `browser-cdp-tools.ts`:

```typescript
export { evaluateJs, cdpSend };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/inngest/executor/browser-agent-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inngest/executor/browser-agent-runner.ts src/inngest/executor/browser-agent-runner.test.ts
git commit -m "feat(design-library): browser agent runner loop with CDP tools"
```

---

### Task 8: Wire runner into `run-design-dna.ts`

**Files:**
- Modify: `src/inngest/executor/run-design-dna.ts`

- [ ] **Step 1: Add imports and DEEP path**

At the top of `src/inngest/executor/run-design-dna.ts`, add:

```typescript
import { createAgentContext } from "./browser-agent-state";
import { runBrowserAgent, createDefaultCdpTools } from "./browser-agent-runner";
import { runAgentPlanningStep } from "./browser-agent-llm";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import type { LLMConfig } from "./design-dna-extraction";
import { resolveLLMConfig } from "./design-dna-extraction";
```

- [ ] **Step 2: Create planner/synthesizer wrappers**

Add helper functions before `executeDesignDnaJob`:

```typescript
function buildAgentPlanner(llmConfig: LLMConfig | null) {
  return async (ctx: BrowserAgentContext, screenshotBase64?: string) => {
    if (!llmConfig) throw new Error("No LLM configured for browser agent");
    const callLlm = async (messages: Array<{ role: string; content: string }>) => {
      const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages,
          max_tokens: 2048,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Agent planner LLM error: ${res.status} ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      return { content: data.choices?.[0]?.message?.content ?? "" };
    };
    return runAgentPlanningStep(ctx, callLlm, screenshotBase64);
  };
}

function buildAgentSynthesizer(llmConfig: LLMConfig | null) {
  return async (steps: BrowserAgentStep[], url: string, categories: string[]) => {
    if (!llmConfig) throw new Error("No LLM configured for synthesis");
    const callLlm = async (messages: Array<{ role: string; content: string }>) => {
      const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages,
          max_tokens: 4096,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Agent synthesis LLM error: ${res.status} ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      return { content: data.choices?.[0]?.message?.content ?? "" };
    };
    return synthesizeDesignDNA(steps, url, categories, callLlm);
  };
}
```

- [ ] **Step 3: Replace DEEP extraction block**

Locate the loop starting around line 257:

```typescript
for (let i = startIndex; i < urls.length; i++) {
```

Inside, replace:

```typescript
const dnaResult = await extractDesignDnaForUrl(serviceClient, {
  url,
  depth,
  categories: categories as string[],
  userId,
  sandboxId: isDeep ? sandboxId : undefined,
  sandboxAccessToken: isDeep ? (sandboxAccessToken ?? undefined) : undefined,
});
```

with:

```typescript
let dnaResult;
if (isDeep) {
  const agentCtx = createAgentContext({
    jobId,
    url,
    categories: categories as string[],
    depth: "deep",
    userId,
    sandboxId,
    sandboxAccessToken,
    maxSteps: 25,
  });

  const llmConfig = await resolveLLMConfig(serviceClient, userId, "high");
  if (!llmConfig) {
    throw new Error("No LLM configured for DEEP browser agent");
  }
  const llm: LLMConfig = {
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    model: llmConfig.model,
    label: llmConfig.label,
    protocol: llmConfig.protocol,
  };

  const tools = createDefaultCdpTools();
  const planner = buildAgentPlanner(llm);
  const synthesizer = buildAgentSynthesizer(llm);

  const fetchInstructions = async (jobId: string) => {
    const { data } = await serviceClient
      .from("design_dna_instructions")
      .select("id, role, content, status, created_at")
      .eq("job_id", jobId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      role: row.role as "user" | "system",
      content: row.content as string,
      status: row.status as "pending" | "consumed" | "canceled",
      createdAt: row.created_at as string,
    }));
  };

  const markConsumed = async (jobId: string) => {
    await serviceClient
      .from("design_dna_instructions")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("status", "pending");
  };

  const agentResult = await runBrowserAgent(
    agentCtx,
    supabase,
    tools,
    planner,
    synthesizer,
    fetchInstructions,
    markConsumed,
  );

  if (!agentResult.ok) {
    throw new Error(agentResult.error);
  }

  const dna = agentResult.dna;
  dnaResult = {
    dna,
    rawMarkdown: `Agent steps: ${agentResult.steps.length}`,
    cleanMarkdown: "",
    rawHtml: "",
    cleanHtml: "",
    contentHygiene: {
      title: dna.name,
      rootSelector: "",
      rawMarkdownChars: 0,
      cleanMarkdownChars: 0,
      rawHtmlChars: 0,
      cleanHtmlChars: 0,
    },
    screenshotUrl: "",
    screenshotBase64: agentResult.steps.find((s) => s.observation.screenshot)?.observation.screenshot,
    screenshots: agentResult.steps
      .filter((s) => s.observation.screenshot)
      .map((s) => s.observation.screenshot as string),
    providerTrace: [`llm:${llm.label}`, "cdp:browser-agent"],
    confidence: 90,
    notes: [`Browser agent completed ${agentResult.steps.length} steps`, ...agentResult.steps.map((s) => `${s.action.type}: ${s.thought}`)],
    blockedReason: null,
  };
} else {
  dnaResult = await extractDesignDnaForUrl(serviceClient, {
    url,
    depth,
    categories: categories as string[],
    userId,
  });
}
```

- [ ] **Step 4: Type import**

Add near existing imports:

```typescript
import type { BrowserAgentStep } from "./browser-agent-state";
```

- [ ] **Step 5: Run typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors (fix any import/protocol issues).

- [ ] **Step 6: Commit**

```bash
git add src/inngest/executor/run-design-dna.ts
git commit -m "feat(design-library): wire browser agent runner into DEEP mode"
```

---

### Task 9: Frontend hooks for instructions

**Files:**
- Modify: `src/components/design-library/api.ts`
- Modify: `src/components/design-library/hooks.ts`
- Modify: `src/components/design-library/types.ts`

- [ ] **Step 1: Add types**

In `src/components/design-library/types.ts`, add:

```typescript
export interface DesignDnaInstruction {
  id: string;
  job_id: string;
  role: "user" | "system";
  content: string;
  status: "pending" | "consumed" | "canceled";
  created_at: string;
  consumed_at?: string | null;
}

export type AgentEventType =
  | "agent_thought"
  | "agent_action"
  | "agent_observation"
  | "agent_instruction_consumed"
  | "agent_done"
  | "agent_error";
```

- [ ] **Step 2: Add API helpers**

In `src/components/design-library/api.ts`, add:

```typescript
import { getSupabaseEnv } from "@/lib/supabase-env";

export async function postInstruction(jobId: string, content: string, role: "user" | "system" = "user"): Promise<void> {
  const { url } = getSupabaseEnv();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${url}/functions/v1/design-library-instructions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId, content, role }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

export async function fetchInstructions(jobId: string): Promise<DesignDnaInstruction[]> {
  const { data, error } = await supabase
    .from("design_dna_instructions")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DesignDnaInstruction[];
}
```

- [ ] **Step 3: Add hooks**

In `src/components/design-library/hooks.ts`, add:

```typescript
export function useDesignDnaInstructions(jobId: string | null) {
  const [instructions, setInstructions] = useState<DesignDnaInstruction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setInstructions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchInstructions(jobId)
      .then((data) => {
        if (!cancelled) setInstructions(data);
      })
      .catch((err) => {
        console.error("fetchInstructions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const channel = supabase
      .channel(`design-dna-instructions-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "design_dna_instructions",
          filter: `job_id=eq.${jobId}`,
        },
        (payload: { new?: unknown }) => {
          setInstructions((prev) => [...prev, payload.new as DesignDnaInstruction]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { instructions, loading };
}

export function usePostInstruction() {
  const [posting, setPosting] = useState(false);

  const post = useCallback(async (jobId: string, content: string, role: "user" | "system" = "user") => {
    setPosting(true);
    try {
      await postInstruction(jobId, content, role);
    } finally {
      setPosting(false);
    }
  }, []);

  return { post, posting };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/design-library/types.ts src/components/design-library/api.ts src/components/design-library/hooks.ts
git commit -m "feat(design-library): frontend hooks and API for agent instructions"
```

---

### Task 10: Render agent events in BrowserPreviewPanel

**Files:**
- Modify: `src/components/design-library/BrowserPreviewPanel.tsx`

- [ ] **Step 1: Add agent event rendering**

Add helper after `getEventConfig`:

```typescript
function getAgentEventDescription(event: RealtimeEvent): string {
  const payload = event.payload ?? {};
  switch (event.event_type) {
    case "agent_thought":
      return `💭 ${payload.thought ?? ""}`;
    case "agent_action":
      return `⚡ ${(payload.action as AgentAction)?.type ?? ""}`;
    case "agent_observation":
      return `👁 ${(payload.observation as AgentObservation)?.type ?? ""}`;
    case "agent_done":
      return `✅ Agente concluiu`;
    case "agent_error":
      return `❌ Erro: ${payload.error ?? ""}`;
    default:
      return getEventConfig(event.event_type).label;
  }
}
```

- [ ] **Step 2: Update EventRow description**

Replace the `description` memo in `EventRow` to handle agent events:

```typescript
const description = useMemo(() => {
  if (event.event_type.startsWith("agent_")) {
    return getAgentEventDescription(event);
  }
  if (event.event_type === "url_extracting") {
    return `${config.label} → ${(event.payload?.url as string) ?? ""}`;
  }
  if (event.event_type === "url_extracted") {
    const count = event.payload?.resultsCount;
    return `${config.label} (${count ?? 0} resultados)`;
  }
  if (event.event_type === "url_error") {
    return `${config.label}: ${(event.payload?.error as string) ?? ""}`;
  }
  return config.label;
}, [event, config.label]);
```

- [ ] **Step 3: Wire instruction posting in chat composer**

Replace `handleSendChat` with:

```typescript
const handleSendChat = useCallback(async () => {
  if (!chatInput.trim() || chatLoading || !jobId) return;
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: chatInput,
    timestamp: new Date().toISOString(),
  };
  setChatMessages((prev) => [...prev, userMsg]);
  setChatInput("");

  // Se o job está rodando, envia como instrução para o agente
  if (!isTerminal) {
    try {
      await postInstruction(jobId, userMsg.content, "user");
      return;
    } catch (err) {
      console.error("postInstruction:", err);
    }
  }

  // Fallback: chat SSE tradicional
  await callChatSSE(userMsg.content);
}, [chatInput, chatLoading, jobId, isTerminal, callChatSSE]);
```

Add import:

```typescript
import { postInstruction } from "./api";
```

- [ ] **Step 4: Add quick-action chips**

Add quick action buttons above the composer:

```typescript
const QUICK_ACTIONS = [
  { label: "Focar no hero", content: "Foca no hero e ignora o resto da página por enquanto." },
  { label: "Capturar motion", content: "Prioriza capturar animações, transições e motion traces." },
  { label: "Mais tipografia", content: "Aprofunda a análise de tipografia e hierarquia de texto." },
  { label: "Sintetizar agora", content: "Você já tem evidências suficientes. Sintetize o Design DNA final." },
];
```

Render inside the composer area before textarea:

```tsx
{!isTerminal && (
  <div className="flex flex-wrap gap-1 px-2 pt-2">
    {QUICK_ACTIONS.map((a) => (
      <button
        key={a.label}
        type="button"
        onClick={() => void handleSendChatWithText(a.content)}
        className="text-[9px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-surface-2"
      >
        {a.label}
      </button>
    ))}
  </div>
)}
```

Add handler:

```typescript
const handleSendChatWithText = useCallback(
  async (text: string) => {
    setChatInput(text);
    await handleSendChat();
  },
  [handleSendChat],
);
```

- [ ] **Step 5: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Fix any errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/design-library/BrowserPreviewPanel.tsx
git commit -m "feat(design-library): render agent events and send instructions from chat"
```

---

### Task 11: Self-review and verification

- [ ] **Step 1: Run full vitest**

```bash
npx vitest run
```

Expected: existing failures remain but no new failures introduced by this work.

- [ ] **Step 2: Run Deno tests**

```bash
cd supabase/functions/agent-run
deno test browser-cdp-tools.test.ts --allow-all
```

Expected: PASS.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Placeholder scan**

Grep for `TODO|TBD|implement later` in files criados/modificados.

```bash
grep -RinE "TODO|TBD|implement later|fill in details" src/inngest/executor/browser-agent* supabase/functions/agent-run/browser-cdp-tools* src/components/design-library/BrowserPreviewPanel.tsx
```

Expected: no matches.

- [ ] **Step 5: Commit final review**

```bash
git add -A
git commit -m "chore(design-library): self-review and verification checkpoint"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-01-browser-agent-deep.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach do you want?
