import { describe, it, expect } from "vitest";
import { isToolDoneOk, toolDoneName, isToolDoneEvent } from "@/lib/timeline-tool-events";
import type { SSEEvent } from "@/lib/agent-progress";

describe("timeline-tool-events", () => {
  describe("isToolDoneOk", () => {
    it("returns true when ok is true", () => {
      expect(isToolDoneOk({ ok: true, name: "fs_read" })).toBe(true);
    });

    it("returns true when ok is not present and no error", () => {
      expect(isToolDoneOk({ name: "fs_read" })).toBe(true);
    });

    it("returns false when ok is false", () => {
      expect(isToolDoneOk({ ok: false, name: "shell" })).toBe(false);
    });

    it("returns false when error is present", () => {
      expect(isToolDoneOk({ error: "something went wrong" })).toBe(false);
    });

    it("returns true when error is null", () => {
      expect(isToolDoneOk({ error: null })).toBe(true);
    });

    it("returns true when error is undefined", () => {
      expect(isToolDoneOk({ error: undefined })).toBe(true);
    });

    it("returns false when ok is false and error is present", () => {
      expect(isToolDoneOk({ ok: false, error: "fail" })).toBe(false);
    });
  });

  describe("toolDoneName", () => {
    it("returns tool name from data", () => {
      expect(toolDoneName({ name: "fs_write" })).toBe("fs_write");
    });

    it("returns 'tool' when name is missing", () => {
      expect(toolDoneName({})).toBe("tool");
    });

    it("returns 'tool' when name is undefined", () => {
      expect(toolDoneName({ name: undefined })).toBe("tool");
    });

    it("coerces non-string name to string", () => {
      expect(toolDoneName({ name: 123 })).toBe("123");
    });
  });

  describe("isToolDoneEvent", () => {
    it("returns true for tool_done type", () => {
      const ev = { type: "tool_done", timestamp: 1000, data: {} } as SSEEvent;
      expect(isToolDoneEvent(ev)).toBe(true);
    });

    it("returns true for tool_result type", () => {
      const ev = { type: "tool_result", timestamp: 1000, data: {} } as SSEEvent;
      expect(isToolDoneEvent(ev)).toBe(true);
    });

    it("returns true for tool_end type", () => {
      const ev = { type: "tool_end", timestamp: 1000, data: {} } as SSEEvent;
      expect(isToolDoneEvent(ev)).toBe(true);
    });

    it("returns false for tool_start type", () => {
      const ev = { type: "tool_start", timestamp: 1000, data: {} } as SSEEvent;
      expect(isToolDoneEvent(ev)).toBe(false);
    });

    it("returns false for assistant_text type", () => {
      const ev = { type: "assistant_text", timestamp: 1000, data: {} } as SSEEvent;
      expect(isToolDoneEvent(ev)).toBe(false);
    });

    it("returns false for unknown type", () => {
      const ev = { type: "unknown", timestamp: 1000, data: {} } as SSEEvent;
      expect(isToolDoneEvent(ev)).toBe(false);
    });
  });
});
