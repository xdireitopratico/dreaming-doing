import { describe, expect, it } from "vitest";
import { actionLabelFromTool, buildInspectorDetailBlocks } from "@/lib/inspector-details";
import type { ForgeTimelineItem } from "@/lib/forge-run";

describe("buildInspectorDetailBlocks", () => {
  it("mapeia thought, action e code", () => {
    const items: ForgeTimelineItem[] = [
      { type: "THOUGHT", id: "t1", durationMs: 4000, text: "Investigating state…" },
      { type: "TOOL", id: "tool-1", name: "fs_read", path: "src/App.tsx" },
      {
        type: "TOOL",
        id: "tool-2",
        name: "shell_exec",
        detail: "cd supabase/functions && grep -n deploy",
      },
      { type: "TASK", id: "task-1", label: "Entendendo deploy do dp-lara" },
    ];

    const blocks = buildInspectorDetailBlocks(items);
    expect(blocks.map((b) => b.kind)).toEqual(["thought", "action", "code", "section"]);
    expect(blocks[1]).toMatchObject({ kind: "action", label: "Read App.tsx" });
    expect(blocks[2]).toMatchObject({
      kind: "code",
      code: "cd supabase/functions && grep -n deploy",
    });
  });

  it("actionLabelFromTool formata busca", () => {
    const label = actionLabelFromTool({
      type: "TOOL",
      id: "x",
      name: "code_search",
      detail: "pending documents",
    });
    expect(label).toContain("Searching the code");
  });
});
