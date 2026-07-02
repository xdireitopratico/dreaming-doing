import { describe, it, expect } from "vitest";
import { assertLlmMatchesG1 } from "./design-dna-extraction";

describe("assertLlmMatchesG1 — Gate G1/G4 alignment", () => {
  const g1Llm = {
    model: "claude-sonnet-4-6",
    label: "Anthropic",
    provider: "anthropic",
    connectorEnv: "anthropic",
    supportsVision: true,
  };

  it("passa quando model coincide com G1", () => {
    expect(() =>
      assertLlmMatchesG1(
        {
          apiKey: "k",
          baseUrl: "https://api.anthropic.com/v1",
          model: "claude-sonnet-4-6",
          label: "Anthropic",
          protocol: "anthropic",
          resolvedFrom: "capabilities.g1",
        },
        g1Llm,
      ),
    ).not.toThrow();
  });

  it("falha closed em drift de modelo", () => {
    expect(() =>
      assertLlmMatchesG1(
        {
          apiKey: "k",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          label: "OpenAI",
          protocol: "openai",
          resolvedFrom: "capabilities.g1",
        },
        g1Llm,
      ),
    ).toThrow(/LLM drift \(G1\)/);
  });
});