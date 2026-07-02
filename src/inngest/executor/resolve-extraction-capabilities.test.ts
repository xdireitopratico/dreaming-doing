import { describe, it, expect } from "vitest";
import { evaluateExtractionCapabilities } from "./resolve-extraction-capabilities.ts";

const ANTHROPIC_KEYS = {
  ANTHROPIC_API_KEY: "sk-ant-test",
};

const GROQ_KEYS = {
  GROQ_API_KEY: "gsk-test",
};

const prefsFixedVision = {
  mode: "fixed" as const,
  fixedPresetId: "anthropic--claude-sonnet-4-6",
};

const prefsFixedNoVision = {
  mode: "fixed" as const,
  fixedPresetId: "pool-groq-flash",
};

const prefsShallowJina = {
  mode: "fixed" as const,
  fixedPresetId: "anthropic--claude-sonnet-4-6",
  webScrapeProvider: "jina",
};

const prefsShallowFirecrawl = {
  mode: "fixed" as const,
  fixedPresetId: "anthropic--claude-sonnet-4-6",
  webScrapeProvider: "firecrawl",
};

describe("evaluateExtractionCapabilities — Gate G1", () => {
  it("SHALLOW: falha sem LLM configurado", () => {
    const result = evaluateExtractionCapabilities({
      depth: "shallow",
      preferences: { webScrapeProvider: "jina" },
      connectorKeys: {},
      e2bApiKey: null,
      webScrapeConnectorToken: "free-or-optional",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_llm");
      expect(result.message).toContain("/api-models");
    }
  });

  it("SHALLOW: falha sem provedor de scrape", () => {
    const result = evaluateExtractionCapabilities({
      depth: "shallow",
      preferences: prefsFixedVision,
      connectorKeys: ANTHROPIC_KEYS,
      e2bApiKey: null,
      webScrapeConnectorToken: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_web_scrape_provider");
      expect(result.message).toContain("Web Scrape");
    }
  });

  it("SHALLOW: falha quando scrape exige token e não há conector", () => {
    const result = evaluateExtractionCapabilities({
      depth: "shallow",
      preferences: prefsShallowFirecrawl,
      connectorKeys: ANTHROPIC_KEYS,
      e2bApiKey: null,
      webScrapeConnectorToken: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_web_scrape_token");
      expect(result.missing).toContain("web_scrape_token");
    }
  });

  it("SHALLOW: passa com LLM + jina (sem token obrigatório)", () => {
    const result = evaluateExtractionCapabilities({
      depth: "shallow",
      preferences: prefsShallowJina,
      connectorKeys: ANTHROPIC_KEYS,
      e2bApiKey: null,
      webScrapeConnectorToken: "free-or-optional",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.depth).toBe("shallow");
      expect(result.webScrapeProvider).toBe("jina");
      expect(result.llm.model).toContain("claude-sonnet");
    }
  });

  it("DEEP: falha sem vision no modelo", () => {
    const result = evaluateExtractionCapabilities({
      depth: "deep",
      preferences: prefsFixedNoVision,
      connectorKeys: GROQ_KEYS,
      e2bApiKey: "e2b_test_key_12345",
      webScrapeConnectorToken: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_vision");
      expect(result.message).toContain("visão");
    }
  });

  it("DEEP: falha sem chave E2B", () => {
    const result = evaluateExtractionCapabilities({
      depth: "deep",
      preferences: prefsFixedVision,
      connectorKeys: ANTHROPIC_KEYS,
      e2bApiKey: null,
      webScrapeConnectorToken: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_e2b");
      expect(result.message).toContain("E2B");
    }
  });

  it("DEEP: passa com LLM vision + E2B", () => {
    const result = evaluateExtractionCapabilities({
      depth: "deep",
      preferences: prefsFixedVision,
      connectorKeys: ANTHROPIC_KEYS,
      e2bApiKey: "e2b_test_key_12345",
      webScrapeConnectorToken: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.depth).toBe("deep");
      expect(result.llm.supportsVision).toBe(true);
      expect(result.llm.connectorEnv).toBe("anthropic");
      expect(result.e2bConfigured).toBe(true);
    }
  });

  it("DEEP ROBIN NVIDIA: connectorEnv=nvidia, model NIM, provider=openai (transport)", () => {
    const result = evaluateExtractionCapabilities({
      depth: "deep",
      preferences: {
        mode: "robin",
        poolProvider: "nvidia",
        robinPoolModelId: "custom--nvidia--kimi-k2-6",
        userModelEntries: [{ slug: "nvidia/kimi-k2.6", env: "nvidia" }],
      },
      connectorKeys: { NVIDIA_API_KEY: "nvapi-test" },
      e2bApiKey: "e2b_test_key_12345",
      webScrapeConnectorToken: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.llm.connectorEnv).toBe("nvidia");
      expect(result.llm.provider).toBe("openai");
      expect(result.llm.model).toBe("moonshotai/kimi-k2.6");
    }
  });
});