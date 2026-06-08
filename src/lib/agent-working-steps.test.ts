import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import {
  buildWorkingSteps,
  buildWorkingTitle,
  lastEditedPath,
} from "@/lib/agent-working-steps";

describe("agent-working-steps", () => {
  it("buildWorkingSteps marca fase execute como ativa", () => {
    const steps = buildWorkingSteps(
      { ...initialAgentProgress, phase: "execute", finished: false },
      { running: true },
    );
    const implement = steps.find((s) => s.id === "implement");
    expect(implement?.state).toBe("active");
    expect(steps.find((s) => s.id === "understand")?.state).toBe("done");
  });

  it("buildWorkingTitle usa arquivo editado", () => {
    const title = buildWorkingTitle(
      {
        ...initialAgentProgress,
        tools: [
          {
            name: "fs_edit",
            args: { path: "src/App.tsx" },
            ok: true,
          },
        ],
        finished: false,
      },
      true,
    );
    expect(title).toContain("App.tsx");
  });

  it("lastEditedPath retorna último fs_write/fs_edit", () => {
    const path = lastEditedPath({
      ...initialAgentProgress,
      tools: [
        { name: "fs_read", args: { path: "a.ts" }, ok: true },
        { name: "fs_write", args: { path: "src/Button.tsx" }, ok: true },
      ],
    });
    expect(path).toBe("src/Button.tsx");
  });

  it("buildWorkingSteps conclui todos quando finished ok", () => {
    const steps = buildWorkingSteps(
      {
        ...initialAgentProgress,
        phase: "done",
        finished: true,
        lastFinishOk: true,
      },
      { running: false },
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });
});