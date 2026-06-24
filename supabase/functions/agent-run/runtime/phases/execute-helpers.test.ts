import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertDesignReadsDone,
  buildStructuredToolContent,
  computeForceTools,
  computeFilePreDiff,
  isActionableIntent,
  isUiPatchCall,
  recordDesignReadPath,
  updateReadOnlyTracker,
} from "./execute-helpers.ts";
import type { ChatResponse } from "../../types.ts";

Deno.test("isActionableIntent — modify e fix", () => {
  assertEquals(isActionableIntent("modify"), true);
  assertEquals(isActionableIntent(undefined), false);
});

Deno.test("computeForceTools — approved plan no step 1", () => {
  assertEquals(
    computeForceTools({
      forceToolsNext: false,
      toolsInvoked: false,
      actionableIntent: true,
      approvedPlanBuild: true,
      loopStep: 1,
    }),
    true,
  );
});

Deno.test("updateReadOnlyTracker — hard stop após 5 leituras vazias", () => {
  const response = {
    role: "assistant" as const,
    content: "",
    tool_calls: [{ id: "1", name: "fs_read", arguments: { path: "a.ts" } }],
  } as ChatResponse;
  const update = updateReadOnlyTracker(4, response, "");
  assertEquals(update.consecutive, 5);
  assertEquals(update.shouldHardStop, true);
});

Deno.test("computeFilePreDiff — fs_write atualiza cache", () => {
  const cache = new Map<string, string>([["src/a.ts", "old"]]);
  const diff = computeFilePreDiff(
    { id: "1", name: "fs_write", arguments: { path: "src/a.ts", content: "new" } },
    cache,
  );
  assertEquals(diff?.after, "new");
  assertEquals(cache.get("src/a.ts"), "new");
});

Deno.test("assertDesignReadsDone — bloqueia patch UI sem fs_read", () => {
  const gate = assertDesignReadsDone({
    readPaths: ["packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx"],
    readsDone: new Set(),
    patchCalls: [{ id: "1", name: "fs_edit", arguments: { path: "src/App.tsx" } }],
  });
  assertEquals(gate.ok, false);
  assertEquals(gate.missing.length, 1);
});

Deno.test("assertDesignReadsDone — passa após leitura", () => {
  const done = new Set<string>();
  recordDesignReadPath(
    { id: "1", name: "fs_read", arguments: { path: "packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx" } },
    done,
  );
  const gate = assertDesignReadsDone({
    readPaths: ["packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx"],
    readsDone: done,
    patchCalls: [{ id: "2", name: "fs_write", arguments: { path: "src/App.tsx" } }],
  });
  assertEquals(gate.ok, true);
  assertEquals(isUiPatchCall({ id: "3", name: "fs_read", arguments: { path: "src/App.tsx" } }), false);
});

Deno.test("buildStructuredToolContent — estrutura erro shell_exec", () => {
  const content = buildStructuredToolContent(
    { id: "1", name: "shell_exec", arguments: { command: "npm run build" } },
    { toolCallId: "1", ok: false, error: "failed", output: "error TS2345" },
  );
  const parsed = JSON.parse(content) as Record<string, unknown>;
  assertEquals(parsed.ok, false);
  assertEquals(parsed.tool, "shell_exec");
  assertEquals(typeof parsed.hint, "string");
});