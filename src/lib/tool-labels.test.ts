import { describe, it, expect } from "vitest";
import {
  getToolLabel,
  getShortToolLabel,
  getToolCategory,
  getToolIconName,
  TOOL_LABELS,
} from "@/lib/tool-labels";

describe("tool-labels", () => {
  describe("getToolLabel", () => {
    it("returns known tool label for fs_read", () => {
      const result = getToolLabel("fs_read");
      expect(result).toEqual({ label: "Ler arquivo", icon: "FileText", category: "file" });
    });

    it("returns known tool label for shell", () => {
      const result = getToolLabel("shell");
      expect(result).toEqual({ label: "Executar comando", icon: "Terminal", category: "shell" });
    });

    it("returns known tool label for deploy_publish", () => {
      const result = getToolLabel("deploy_publish");
      expect(result).toEqual({ label: "Publicar projeto", icon: "Globe", category: "deploy" });
    });

    it("returns fallback for unknown tool name", () => {
      const result = getToolLabel("unknown_tool_xyz");
      expect(result).toEqual({ label: "unknown_tool_xyz", icon: "Box", category: "other" });
    });

    it("returns fallback for empty string", () => {
      const result = getToolLabel("");
      expect(result).toEqual({ label: "", icon: "Box", category: "other" });
    });
  });

  describe("getShortToolLabel", () => {
    it("returns label for known tool", () => {
      expect(getShortToolLabel("fs_write")).toBe("Criar arquivo");
    });

    it("returns raw name for unknown tool", () => {
      expect(getShortToolLabel("nonexistent")).toBe("nonexistent");
    });
  });

  describe("getToolCategory", () => {
    it("returns file for fs_ tools", () => {
      expect(getToolCategory("fs_read")).toBe("file");
      expect(getToolCategory("fs_write")).toBe("file");
      expect(getToolCategory("fs_edit")).toBe("file");
    });

    it("returns shell for shell tools", () => {
      expect(getToolCategory("shell")).toBe("shell");
      expect(getToolCategory("shell_bg")).toBe("shell");
    });

    it("returns code for code tools", () => {
      expect(getToolCategory("apply_patch")).toBe("code");
      expect(getToolCategory("grep_tool")).toBe("code");
    });

    it("returns deploy for deploy tools", () => {
      expect(getToolCategory("deploy_publish")).toBe("deploy");
      expect(getToolCategory("deploy_preview")).toBe("deploy");
    });

    it("returns other for unknown tools", () => {
      expect(getToolCategory("random")).toBe("other");
    });
  });

  describe("getToolIconName", () => {
    it("returns correct icon for known tool", () => {
      expect(getToolIconName("fs_read")).toBe("FileText");
      expect(getToolIconName("shell")).toBe("Terminal");
      expect(getToolIconName("taste")).toBe("Zap");
    });

    it("returns Box for unknown tool", () => {
      expect(getToolIconName("unknown")).toBe("Box");
    });
  });

  describe("TOOL_LABELS registry", () => {
    it("has all expected tool entries", () => {
      const expectedKeys = [
        "fs_read",
        "fs_write",
        "fs_edit",
        "fs_list",
        "fs_glob",
        "fs_delete",
        "shell",
        "shell_bg",
        "apply_patch",
        "read_tool",
        "write_tool",
        "edit_tool",
        "task_tool",
        "grep_tool",
        "glob_tool",
        "list_tool",
        "deploy_publish",
        "deploy_preview",
        "mcp_call",
        "taste",
        "connector_keys",
        "memory",
        "web_fetch",
        "web_search",
      ];
      for (const key of expectedKeys) {
        expect(TOOL_LABELS[key]).toBeDefined();
      }
    });

    it("all entries have required fields", () => {
      for (const [, entry] of Object.entries(TOOL_LABELS)) {
        expect(entry.label).toBeDefined();
        expect(entry.icon).toBeDefined();
        expect(["file", "shell", "code", "deploy", "other"]).toContain(entry.category);
      }
    });
  });
});
