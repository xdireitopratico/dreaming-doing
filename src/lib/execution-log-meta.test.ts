import { describe, expect, it } from "vitest";
import {
  appendExecutionLogEntry,
  buildExecutionLogMeta,
  MAX_EXECUTION_LOG_ENTRIES,
  restoreExecutionLogFromRows,
} from "@/lib/execution-log-meta";

describe("execution-log-meta", () => {
  it("appendExecutionLogEntry limita tamanho", () => {
    let log: string[] = [];
    for (let i = 0; i < MAX_EXECUTION_LOG_ENTRIES + 5; i++) {
      log = appendExecutionLogEntry(log, `step-${i}`);
    }
    expect(log).toHaveLength(MAX_EXECUTION_LOG_ENTRIES);
    expect(log[0]).toBe("step-5");
    expect(log.at(-1)).toBe(`step-${MAX_EXECUTION_LOG_ENTRIES + 4}`);
  });

  it("buildExecutionLogMeta inclui executionLog e lastStep", () => {
    const meta = buildExecutionLogMeta({ foo: 1 }, ["a", "b"], 7);
    expect(meta.foo).toBe(1);
    expect(meta.executionLog).toEqual(["a", "b"]);
    expect(meta.lastStep).toBe(7);
    expect(typeof meta.updatedAt).toBe("string");
  });

  it("restoreExecutionLogFromRows pega última mensagem com log", () => {
    const rows = [
      { meta: { executionLog: ["old"] } },
      { meta: {} },
      { meta: { executionLog: ["x", "y"] } },
    ];
    expect(restoreExecutionLogFromRows(rows)).toEqual(["x", "y"]);
  });
});
