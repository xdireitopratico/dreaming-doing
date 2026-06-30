import { describe, it, expect } from "vitest";
import { timelineFromExecutionLog } from "@/lib/execution-log-timeline";

describe("execution-log-timeline", () => {
  describe("timelineFromExecutionLog", () => {
    it("returns empty array for empty input", () => {
      expect(timelineFromExecutionLog([])).toEqual([]);
    });

    it("skips blank lines", () => {
      expect(timelineFromExecutionLog(["", "  ", "\t"])).toEqual([]);
    });

    it("parses a read line into tool_start + tool_done pair", () => {
      const result = timelineFromExecutionLog(["read src/index.ts"]);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("tool_start");
      expect(result[0].data.name).toBe("fs_read");
      expect((result[0].data.args as { path: string }).path).toBe("src/index.ts");
      expect(result[1].type).toBe("tool_done");
      expect(result[1].data.name).toBe("fs_read");
      expect(result[1].data.ok).toBe(true);
    });

    it("parses case-insensitive Read line", () => {
      const result = timelineFromExecutionLog(["Read package.json"]);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("tool_start");
      expect(result[0].data.name).toBe("fs_read");
    });

    it("parses 'lendo' keyword as read", () => {
      const result = timelineFromExecutionLog(["lendo arquivo main.ts"]);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("tool_start");
      expect(result[0].data.name).toBe("fs_read");
      // path captures entire trimmed line (replace only strips 'read' prefix)
      expect((result[0].data.args as { path: string }).path).toBe("lendo arquivo main.ts");
    });

    it("parses edit line into tool_start + tool_done pair", () => {
      const result = timelineFromExecutionLog(["edit src/app.tsx"]);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("tool_start");
      expect(result[0].data.name).toBe("fs_edit");
      expect((result[0].data.args as { path: string }).path).toBe("edit src/app.tsx");
      expect(result[1].type).toBe("tool_done");
      expect(result[1].data.name).toBe("fs_edit");
      expect(result[1].data.ok).toBe(true);
    });

    it("parses 'editou' keyword as edit", () => {
      const result = timelineFromExecutionLog(["editou main.tsx"]);
      expect(result).toHaveLength(2);
      expect(result[0].data.name).toBe("fs_edit");
    });

    it("parses 'edited' keyword as edit", () => {
      const result = timelineFromExecutionLog(["edited file.ts"]);
      expect(result).toHaveLength(2);
      expect(result[0].data.name).toBe("fs_edit");
    });

    it("parses unknown lines as thinking_text events", () => {
      const result = timelineFromExecutionLog(["analyzing the codebase"]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("thinking_text");
      expect(result[0].data.text).toBe("analyzing the codebase");
      expect(result[0].data.delta).toBe(true);
    });

    it("assigns monotonically increasing timestamps", () => {
      const result = timelineFromExecutionLog(["read a.ts", "edit b.ts", "some text"]);
      const timestamps = result.map((e) => e.timestamp);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
      }
    });

    it("handles multiple lines with mixed types", () => {
      const lines = ["read src/lib/utils.ts", "analyzing structure", "edit src/lib/utils.ts"];
      const result = timelineFromExecutionLog(lines);
      // 2 (read) + 1 (text) + 2 (edit) = 5 events
      expect(result).toHaveLength(5);
      expect(result[0].type).toBe("tool_start");
      expect(result[2].type).toBe("thinking_text");
      expect(result[3].type).toBe("tool_start");
    });
  });
});
