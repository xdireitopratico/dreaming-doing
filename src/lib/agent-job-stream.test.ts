import { describe, expect, it } from "vitest";
import { buildJobStreamTree } from "@/lib/agent-job-stream";

describe("buildJobStreamTree validate_fail hygiene", () => {
  it("colapsa validate_fail preflight repetido em um único resultado", () => {
    const nodes = buildJobStreamTree([
      {
        type: "validate_fail",
        data: {
          preflight: true,
          feedback: "Preflight falhou — preparando ambiente",
        },
        timestamp: 1,
      },
      {
        type: "validate_fail",
        data: {
          preflight: true,
          feedback: "Preflight falhou — preparando ambiente",
        },
        timestamp: 2,
      },
    ]);

    const results = nodes.filter((node) => node.kind === "result");
    expect(results).toHaveLength(1);
    if (results[0]?.kind === "result") {
      expect(results[0].status).toBe("failed");
      expect(results[0].summary).toBe("Preflight falhou");
    }
  });
});
