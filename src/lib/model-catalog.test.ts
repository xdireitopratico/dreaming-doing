import { describe, it, expect } from "vitest";
import {
  inferEnvFromSlug,
  userModelPresetId,
  buildUserModelPreset,
  getPresetById,
  RANKED_MODEL_PRESETS,
  AI_ENVS_SORTED,
  AI_ENV_META,
  normalizePresetId,
} from "@/lib/model-catalog";

describe("model-catalog", () => {
  describe("inferEnvFromSlug", () => {
    it("returns anthropic for anthropic/ prefix", () => {
      expect(inferEnvFromSlug("anthropic/claude-opus-4-8")).toBe("anthropic");
    });

    it("returns openai for openai/ prefix", () => {
      expect(inferEnvFromSlug("openai/gpt-5.5")).toBe("openai");
    });

    it("returns gemini for google/ prefix", () => {
      expect(inferEnvFromSlug("google/gemini-3.5-flash")).toBe("gemini");
    });

    it("returns xai for xai/ prefix", () => {
      expect(inferEnvFromSlug("xai/grok-4.3")).toBe("xai");
    });

    it("returns nvidia for nvidia/ prefix", () => {
      expect(inferEnvFromSlug("nvidia/nemotron-3-ultra-550b")).toBe("nvidia");
    });

    it("returns deepseek for deepseek/ prefix", () => {
      expect(inferEnvFromSlug("deepseek/deepseek-v4-pro")).toBe("deepseek");
    });

    it("returns alibaba for qwen/ prefix", () => {
      expect(inferEnvFromSlug("qwen/qwen3.7-max")).toBe("alibaba");
    });

    it("returns minimax for minimax/ prefix", () => {
      expect(inferEnvFromSlug("minimax/minimax-m3")).toBe("minimax");
    });

    it("returns moonshotai for moonshotai/ prefix", () => {
      expect(inferEnvFromSlug("moonshotai/kimi-k2.6")).toBe("moonshotai");
    });

    it("returns xiaomi for xiaomi/ prefix", () => {
      expect(inferEnvFromSlug("xiaomi/mimo-v2.5-pro")).toBe("xiaomi");
    });

    it("returns ollama for ollama/ prefix", () => {
      expect(inferEnvFromSlug("ollama/llama3.2")).toBe("ollama");
    });

    it("returns openrouter for unknown prefix", () => {
      expect(inferEnvFromSlug("unknown/model")).toBe("openrouter");
    });

    it("trims whitespace", () => {
      expect(inferEnvFromSlug("  anthropic/claude-opus-4-8  ")).toBe("anthropic");
    });
  });

  describe("userModelPresetId", () => {
    it("converts slug to preset id with custom-- prefix", () => {
      expect(userModelPresetId("anthropic/my-model")).toBe("custom--anthropic--my-model");
    });

    it("replaces dots with hyphens", () => {
      expect(userModelPresetId("openai/gpt-5.5")).toBe("custom--openai--gpt-5-5");
    });

    it("replaces slashes with double dash", () => {
      expect(userModelPresetId("a/b/c")).toBe("custom--a--b--c");
    });

    it("trims whitespace", () => {
      expect(userModelPresetId("  openai/model  ")).toBe("custom--openai--model");
    });
  });

  describe("buildUserModelPreset", () => {
    it("builds a preset from a UserModelEntry", () => {
      const preset = buildUserModelPreset({
        slug: "openai/my-custom-model",
        env: "openai",
      });
      expect(preset.id).toBe("custom--openai--my-custom-model");
      expect(preset.env).toBe("openai");
      expect(preset.tier).toBe("balanced");
      expect(preset.brand).toBe("Custom");
      expect(preset.rank).toBe(5000);
      expect(preset.llmProvider).toBe("openai");
      expect(preset.secretKey).toBe("OPENAI_API_KEY");
    });

    it("uses custom label if provided", () => {
      const preset = buildUserModelPreset({
        slug: "openai/gpt-5.5",
        env: "openai",
        label: "My GPT",
      });
      expect(preset.label).toBe("My GPT");
    });

    it("falls back to slug tail for label", () => {
      const preset = buildUserModelPreset({
        slug: "openai/gpt-5.5",
        env: "openai",
      });
      expect(preset.label).toBe("gpt-5.5");
    });

    it("handles custom- env", () => {
      const preset = buildUserModelPreset({
        slug: "custom-host/my-model",
        env: "custom-host",
      });
      expect(preset.env).toBe("custom-host");
      expect(preset.llmProvider).toBe("openai");
    });
  });

  describe("normalizePresetId", () => {
    it("returns empty string for undefined", () => {
      expect(normalizePresetId(undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(normalizePresetId("")).toBe("");
    });

    it("returns id as-is when already canonical", () => {
      expect(normalizePresetId("anthropic--claude-opus-4-8")).toBe("anthropic--claude-opus-4-8");
    });

    it("resolves legacy alias", () => {
      expect(normalizePresetId("anthropic-sonnet")).toBe("anthropic--claude-sonnet-4-6");
      expect(normalizePresetId("anthropic-opus")).toBe("anthropic--claude-opus-4-8");
      expect(normalizePresetId("xai-grok3")).toBe("xai--grok-4-3");
    });

    it("converts slug format to preset ID", () => {
      expect(normalizePresetId("anthropic/claude-opus-4-8")).toBe("anthropic--claude-opus-4-8");
    });

    it("trims whitespace", () => {
      expect(normalizePresetId("  anthropic-opus  ")).toBe("anthropic--claude-opus-4-8");
    });
  });

  describe("getPresetById", () => {
    it("returns preset for known ID", () => {
      const preset = getPresetById("anthropic--claude-opus-4-8");
      expect(preset).toBeDefined();
      expect(preset.label).toBe("Claude Opus 4.8");
      expect(preset.env).toBe("anthropic");
    });

    it("returns UNCONFIGURED_PRESET for unknown preset ID", () => {
      const preset = getPresetById("nonexistent--model");
      expect(preset.id).toBe("");
      expect(preset.label).toBe("Não configurado");
    });

    it("returns UNCONFIGURED_PRESET for empty id", () => {
      const preset = getPresetById("");
      expect(preset.id).toBe("");
    });

    it("returns UNCONFIGURED_PRESET for undefined", () => {
      const preset = getPresetById(undefined);
      expect(preset.id).toBe("");
    });
  });

  describe("RANKED_MODEL_PRESETS", () => {
    it("has expected number of presets", () => {
      expect(RANKED_MODEL_PRESETS.length).toBeGreaterThan(20);
    });

    it("all presets have required fields", () => {
      for (const p of RANKED_MODEL_PRESETS) {
        expect(p.id).toBeTruthy();
        expect(p.env).toBeTruthy();
        expect(p.model).toBeTruthy();
        expect(p.label).toBeTruthy();
        expect(p.tier).toBeTruthy();
        expect(p.llmProvider).toBeTruthy();
        expect(p.secretKey).toBeTruthy();
      }
    });

    it("presets are ordered by rank", () => {
      for (let i = 1; i < RANKED_MODEL_PRESETS.length; i++) {
        expect(RANKED_MODEL_PRESETS[i].rank).toBeGreaterThanOrEqual(
          RANKED_MODEL_PRESETS[i - 1].rank,
        );
      }
    });
  });

  describe("AI_ENVS_SORTED", () => {
    it("is sorted alphabetically", () => {
      const sorted = [...AI_ENVS_SORTED].sort();
      expect(AI_ENVS_SORTED).toEqual(sorted);
    });

    it("contains expected environments", () => {
      expect(AI_ENVS_SORTED).toContain("anthropic");
      expect(AI_ENVS_SORTED).toContain("openai");
      expect(AI_ENVS_SORTED).toContain("gemini");
      expect(AI_ENVS_SORTED).toContain("ollama");
    });
  });

  describe("AI_ENV_META", () => {
    it("has metadata for all sorted envs", () => {
      for (const env of AI_ENVS_SORTED) {
        expect(AI_ENV_META[env]).toBeDefined();
        expect(AI_ENV_META[env].label).toBeTruthy();
        expect(AI_ENV_META[env].docUrl).toBeTruthy();
        expect(AI_ENV_META[env].keyPrefix).toBeTruthy();
      }
    });
  });
});
