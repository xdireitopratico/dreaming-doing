import { describe, expect, it } from "vitest";
import {
  agentRunToAuditEntry,
  filterMessagesForRun,
  mapRunStatus,
  parseRunMeta,
} from "@/lib/agent-runs";

describe("agent-runs", () => {
  it("mapRunStatus mapeia canceled para stopped", () => {
    expect(mapRunStatus("canceled")).toBe("stopped");
    expect(mapRunStatus("completed")).toBe("completed");
  });

  it("parseRunMeta extrai provider e tools", () => {
    const meta = parseRunMeta({
      provider: "ROBIN · Groq",
      model: "llama-3.3-70b",
      toolsUsed: ["fs_write", "shell_exec"],
      summary: "Feito.",
    });
    expect(meta.provider).toBe("ROBIN · Groq");
    expect(meta.toolsUsed).toEqual(["fs_write", "shell_exec"]);
    expect(meta.summary).toBe("Feito.");
  });

  it("agentRunToAuditEntry monta entrada de audit", () => {
    const entry = agentRunToAuditEntry(
      {
        id: "run-1",
        project_id: "p1",
        conversation_id: "c1",
        user_id: "u1",
        status: "failed",
        started_at: "2026-06-05T10:00:00Z",
        finished_at: "2026-06-05T10:05:00Z",
        canceled_at: null,
        steps: 4,
        error: "timeout",
        meta: { provider: "GPT-4o", model: "gpt-4o", toolsUsed: ["fs_read"] },
      },
      "Meu App",
    );
    expect(entry.projectName).toBe("Meu App");
    expect(entry.status).toBe("failed");
    expect(entry.toolsUsed).toEqual(["fs_read"]);
    expect(entry.error).toBe("timeout");
  });

  it("filterMessagesForRun filtra por janela temporal", () => {
    const msgs = [
      { id: "a", created_at: "2026-06-05T09:59:00Z" },
      { id: "b", created_at: "2026-06-05T10:01:00Z" },
      { id: "c", created_at: "2026-06-05T10:04:30Z" },
      { id: "d", created_at: "2026-06-05T11:00:00Z" },
    ];
    const filtered = filterMessagesForRun(msgs, {
      started_at: "2026-06-05T10:00:00Z",
      finished_at: "2026-06-05T10:05:00Z",
    });
    expect(filtered.map((m) => m.id)).toEqual(["b", "c"]);
  });
});