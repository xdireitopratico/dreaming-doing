import { describe, it, expect, beforeEach } from "vitest";
import {
  customProviderSecretKey,
  customProviderBaseUrlKey,
  providerWire,
  builtInProviderIds,
  providerById,
  isBuiltInProvider,
  isKnownProvider,
  allProviders,
  providersSorted,
  providersSupportingPool,
  addCustomProvider,
  removeCustomProvider,
  loadCustomProviders,
  clearCustomProvidersCache,
  setCustomProvidersCache,
  toConnectorPayload,
  BUILT_IN_PROVIDERS,
} from "@/lib/ai-provider-registry";

describe("ai-provider-registry", () => {
  beforeEach(() => {
    clearCustomProvidersCache();
  });

  describe("customProviderSecretKey", () => {
    it("converts provider id to uppercase API key name", () => {
      expect(customProviderSecretKey("custom-myhost")).toBe("CUSTOM_MYHOST_API_KEY");
    });

    it("replaces hyphens with underscores", () => {
      expect(customProviderSecretKey("custom-my-local-llm")).toBe("CUSTOM_MY_LOCAL_LLM_API_KEY");
    });
  });

  describe("customProviderBaseUrlKey", () => {
    it("replaces _API_KEY suffix with _BASE_URL", () => {
      expect(customProviderBaseUrlKey("CUSTOM_MYHOST_API_KEY")).toBe("CUSTOM_MYHOST_BASE_URL");
    });

    it("replaces only trailing _API_KEY", () => {
      expect(customProviderBaseUrlKey("MY_API_KEY")).toBe("MY_BASE_URL");
    });
  });

  describe("providerWire", () => {
    it("returns anthropic wire for anthropic provider", () => {
      const wire = providerWire("anthropic");
      expect(wire.llmProvider).toBe("anthropic");
      expect(wire.secretKey).toBe("ANTHROPIC_API_KEY");
    });

    it("returns openai wire for openai provider", () => {
      const wire = providerWire("openai");
      expect(wire.llmProvider).toBe("openai");
      expect(wire.secretKey).toBe("OPENAI_API_KEY");
    });

    it("returns gemini wire for gemini provider", () => {
      const wire = providerWire("gemini");
      expect(wire.llmProvider).toBe("gemini");
      expect(wire.secretKey).toBe("GEMINI_API_KEY");
    });

    it("returns ollama wire for ollama provider", () => {
      const wire = providerWire("ollama");
      expect(wire.llmProvider).toBe("ollama");
      expect(wire.secretKey).toBe("OLLAMA_BASE_URL");
    });

    it("returns openai wire with custom secret for custom provider", () => {
      const wire = providerWire("custom-myhost");
      expect(wire.llmProvider).toBe("openai");
      expect(wire.secretKey).toBe("CUSTOM_MYHOST_API_KEY");
    });

    it("uses baseUrlOverride when provided", () => {
      const wire = providerWire("openai", "https://custom.endpoint.com/v1/");
      expect(wire.baseUrl).toBe("https://custom.endpoint.com/v1");
    });

    it("trims trailing slash from baseUrlOverride", () => {
      const wire = providerWire("xai", "https://api.x.ai/v1/");
      expect(wire.baseUrl).toBe("https://api.x.ai/v1");
    });

    it("falls back to openrouter for unknown provider", () => {
      const wire = providerWire("nonexistent");
      expect(wire.llmProvider).toBe("openai");
      expect(wire.secretKey).toBe("OPENROUTER_API_KEY");
      expect(wire.baseUrl).toBe("https://openrouter.ai/api/v1");
    });
  });

  describe("builtInProviderIds", () => {
    it("returns all built-in provider IDs", () => {
      const ids = builtInProviderIds();
      expect(ids).toContain("anthropic");
      expect(ids).toContain("openai");
      expect(ids).toContain("gemini");
      expect(ids).toContain("ollama");
      expect(ids).toContain("nvidia");
      expect(ids).toContain("xai");
      expect(ids).toContain("groq");
      expect(ids.length).toBe(BUILT_IN_PROVIDERS.length);
    });
  });

  describe("providerById", () => {
    it("finds built-in provider by id", () => {
      const p = providerById("anthropic");
      expect(p).toBeDefined();
      expect(p!.label).toBe("Anthropic");
    });

    it("returns undefined for unknown id", () => {
      expect(providerById("nonexistent")).toBeUndefined();
    });
  });

  describe("isBuiltInProvider", () => {
    it("returns true for built-in provider", () => {
      expect(isBuiltInProvider("anthropic")).toBe(true);
      expect(isBuiltInProvider("openai")).toBe(true);
    });

    it("returns false for custom provider", () => {
      expect(isBuiltInProvider("custom-myhost")).toBe(false);
    });

    it("returns false for random string", () => {
      expect(isBuiltInProvider("random")).toBe(false);
    });
  });

  describe("isKnownProvider", () => {
    it("returns true for built-in provider", () => {
      expect(isKnownProvider("openai")).toBe(true);
    });

    it("returns false for unknown provider when no custom added", () => {
      expect(isKnownProvider("custom-myhost")).toBe(false);
    });
  });

  describe("custom providers cache", () => {
    it("starts empty after clear", () => {
      expect(loadCustomProviders()).toEqual([]);
    });

    it("addCustomProvider adds to cache", () => {
      const p = addCustomProvider({
        label: "My LLM",
        baseUrl: "https://myllm.example.com/v1",
      });
      expect(p.id).toMatch(/^custom-/);
      expect(p.label).toBe("My LLM");
      expect(p.baseUrl).toBe("https://myllm.example.com/v1");
      expect(p.isUserAdded).toBe(true);
      expect(loadCustomProviders()).toHaveLength(1);
    });

    it("removeCustomProvider removes from cache", () => {
      const p = addCustomProvider({
        label: "Temp",
        baseUrl: "https://temp.example.com",
      });
      expect(loadCustomProviders()).toHaveLength(1);
      removeCustomProvider(p.id);
      expect(loadCustomProviders()).toHaveLength(0);
    });

    it("setCustomProvidersCache only keeps user-added custom providers", () => {
      const valid = {
        id: "custom-test" as const,
        label: "Test",
        icon: "globe" as const,
        docUrl: "",
        keyPrefix: "sk-",
        keyPlaceholder: "sk-...",
        costPerM: 0,
        openAiCompatible: true,
        supportsPool: false,
        baseUrl: "https://test.com",
        secretKey: "CUSTOM_TEST_API_KEY",
        llmProvider: "openai" as const,
        isUserAdded: true,
        models: [],
      };
      const invalid = { ...valid, id: "anthropic" as const, isUserAdded: true };
      setCustomProvidersCache([valid, invalid]);
      const cached = loadCustomProviders();
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe("custom-test");
    });
  });

  describe("allProviders", () => {
    it("includes built-in providers", () => {
      const all = allProviders();
      expect(all.length).toBeGreaterThanOrEqual(BUILT_IN_PROVIDERS.length);
    });

    it("includes custom providers when added", () => {
      addCustomProvider({ label: "Extra", baseUrl: "https://extra.com" });
      const all = allProviders();
      expect(all.length).toBe(BUILT_IN_PROVIDERS.length + 1);
    });
  });

  describe("providersSorted", () => {
    it("returns providers sorted alphabetically by label", () => {
      const sorted = providersSorted();
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].label.localeCompare(sorted[i].label, "pt")).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("providersSupportingPool", () => {
    it("returns only providers with supportsPool=true", () => {
      const pool = providersSupportingPool();
      expect(pool.length).toBeGreaterThan(0);
      for (const p of pool) {
        expect(p.supportsPool).toBe(true);
      }
    });

    it("includes groq and nvidia", () => {
      const ids = providersSupportingPool().map((p) => p.id);
      expect(ids).toContain("groq");
      expect(ids).toContain("nvidia");
    });
  });

  describe("toConnectorPayload", () => {
    it("returns anthropic kind for anthropic", () => {
      const payload = toConnectorPayload("anthropic");
      expect(payload.kind).toBe("anthropic");
      expect(payload.meta.label).toBe("Anthropic");
    });

    it("returns openai kind for other providers", () => {
      const payload = toConnectorPayload("openai");
      expect(payload.kind).toBe("openai");
      expect(payload.meta.provider).toBe("openai");
    });

    it("uses baseUrl override when provided", () => {
      const payload = toConnectorPayload("openai", "https://custom.api.com/v1");
      expect(payload.kind).toBe("openai");
      expect(payload.meta.baseUrl).toBe("https://custom.api.com/v1");
    });
  });
});
