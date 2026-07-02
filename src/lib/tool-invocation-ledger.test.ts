import { describe, expect, it } from "vitest";
import {
  applyToolDoneRow,
  applyToolStartRow,
  closeToolInvocation,
  createToolLedger,
  findPendingToolIndex,
  openToolInvocation,
} from "@/lib/tool-invocation-ledger";

describe("tool-invocation-ledger", () => {
  it("correlaciona tool_done por toolCallId em paralelo", () => {
    let tools = applyToolStartRow([], {
      name: "fs_read",
      args: { path: "a.ts" },
      toolCallId: "tc-1",
    });
    tools = applyToolStartRow(tools, {
      name: "fs_read",
      args: { path: "b.ts" },
      toolCallId: "tc-2",
    });
    tools = applyToolDoneRow(tools, { name: "fs_read", toolCallId: "tc-2", ok: true });
    expect(tools[0]?.ok).toBeUndefined();
    expect(tools[1]?.ok).toBe(true);
  });

  it("fallback LIFO por nome sem toolCallId", () => {
    let tools = applyToolStartRow([], { name: "fs_read", args: { path: "a.ts" } });
    tools = applyToolDoneRow(tools, { name: "fs_read", ok: true });
    expect(tools[0]?.ok).toBe(true);
  });

  it("e3b71248 — 5 reads paralelos fecham todos", () => {
    let ledger = createToolLedger();
    const paths = [
      "packages/forge-ui/src/compositions/opinionated/KineticHeadlineReveal.tsx",
      "packages/forge-ui/src/compositions/opinionated/GlassNavFloating.tsx",
      "packages/forge-ui/src/compositions/opinionated/SpotlightShowcaseGrid.tsx",
      "packages/forge-ui/src/compositions/opinionated/StickyStackNarrative.tsx",
      "packages/forge-ui/src/compositions/opinionated/ProcessStepsHowItWorks.tsx",
    ];
    const ids = [
      "call-8a1b15af-eea3-4dc6-974b-6e1ee96f0a9b",
      "call-bbdffa5b-9e28-4f8c-be9c-97a70cf8d610",
      "call-3384d8ec-adf3-4c0a-a5f3-3cdd52c07bdc",
      "call-418e21d3-ff04-4095-87b5-2638b0433cc1",
      "call-86429d99-ada3-4da4-8b12-3d24dd80a25a",
    ];
    paths.forEach((path, i) => {
      const opened = openToolInvocation(ledger, {
        name: "fs_read",
        args: { path },
        toolCallId: ids[i],
        openedAt: 38 + i,
        seq: 38 + i,
      });
      ledger = opened.ledger;
    });
    const doneOrder = [1, 2, 0, 4, 3];
    for (const idx of doneOrder) {
      const closed = closeToolInvocation(ledger, {
        name: "fs_read",
        toolCallId: ids[idx],
        ok: true,
        closedAt: 43 + idx,
      });
      ledger = closed.ledger;
    }
    for (const inv of ledger.invocations) {
      expect(inv.ok, inv.id).toBe(true);
      expect(inv.closedAt, inv.id).toBeDefined();
    }
    expect(findPendingToolIndex(ledger.invocations, { name: "fs_read" })).toBe(-1);
  });
});