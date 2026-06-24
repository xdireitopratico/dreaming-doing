import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBuildAgentSystemPrompt, buildBuildContextBlock } from "./llm-chat.ts";
import type { AgentContext } from "../types.ts";

Deno.test("buildBuildContextBlock — projeto novo", () => {
  assertEquals(buildBuildContextBlock(null), "(projeto novo)");
});

Deno.test("buildBuildContextBlock — inclui config e manifest", () => {
  const context: AgentContext = {
    projectConfig: "stack: next",
    manifest: "- app/page.tsx",
    files: [],
    gitLog: "",
    dbSchema: "",
    lastPlan: "",
  };
  const block = buildBuildContextBlock(context);
  assertEquals(block.includes("## Contexto do Projeto"), true);
  assertEquals(block.includes("stack: next"), true);
  assertEquals(block.includes("app/page.tsx"), true);
});

Deno.test("buildBuildAgentSystemPrompt — modo build sem planMode", () => {
  const prompt = buildBuildAgentSystemPrompt({
    projectTemplate: "vite-react",
    stackAddon: "",
    sessionAddon: "",
    tasteStart: false,
    skillPrompt: "",
  });
  assertEquals(prompt.length > 200, true);
  assertEquals(prompt.includes("## Execução Build"), true);
  assertEquals(prompt.includes("## Execução Plan"), false);
});