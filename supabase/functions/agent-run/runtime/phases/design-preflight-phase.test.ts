import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runDesignPreflightIfNeeded } from "./design-preflight-phase.ts";
import type { AgentState } from "../../types.ts";
import { LoopPhase } from "../../types.ts";
import type { ToolRegistry } from "../../registry.ts";

function minimalState(): AgentState {
  return {
    projectId: "proj-1",
    conversationId: "conv-1",
    userId: "user-1",
    messages: [],
    currentStepIndex: 0,
    totalSteps: 0,
    phase: LoopPhase.GATHER_CONTEXT,
    executionLog: [],
    context: {
      files: [
        {
          id: "f1",
          path: "package.json",
          content: '{"dependencies":{"@forge/ui":"file:./packages/forge-ui"}}',
          updated_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "f2",
          path: "packages/forge-ui/package.json",
          content: '{"name":"@forge/ui"}',
          updated_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "f3",
          path: "packages/forge-ui/src/index.ts",
          content: 'export * from "./components";',
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      projectConfig: "config",
      manifest: "manifest",
      gitLog: "",
      dbSchema: "",
      lastPlan: "",
    },
    intent: null,
    plan: null,
    validationResults: [],
    retryFeedback: null,
  };
}

Deno.test("runDesignPreflightIfNeeded — falha terminal não injeta pseudo-turno de correção", async () => {
  const state = minimalState();
  const events: Array<{ type: string; data: unknown }> = [];
  const outcome = await runDesignPreflightIfNeeded({
    planMode: false,
    projectTemplate: "vite-react",
    resumeRun: false,
    touchedPaths: new Set(),
    state,
    reg: {
      execute: async (call: { arguments: { command?: string } }) => {
        const command = String(call.arguments.command ?? "");
        if (command.includes("test -e") && command.includes("package.json")) {
          return { ok: true, output: { stdout: "yes\n", stderr: "" } };
        }
        if (command.includes("test -e") && command.includes("node_modules")) {
          return { ok: true, output: { stdout: "yes\n", stderr: "" } };
        }
        if (command.includes("npm run build")) {
          return { ok: false, output: { stdout: "", stderr: "error TS2307" } };
        }
        return { ok: true, output: { stdout: "", stderr: "" } };
      },
    } as unknown as ToolRegistry,
    platformLimitExceeded: () => false,
    gatherContext: async () => {},
    touchHeartbeat: async () => {},
    emit: (type, data) => events.push({ type, data }),
  });

  assertEquals(outcome?.status, "recoverable_fail");
  assertEquals(state.messages.length, 0);
  assertEquals(events.some((e) => e.type === "validate_fail"), false);
});
