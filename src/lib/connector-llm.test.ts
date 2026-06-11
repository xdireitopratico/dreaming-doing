import { describe, expect, it } from "vitest";
import { hasLlmConnectorRows } from "./connector-llm";

describe("hasLlmConnectorRows", () => {
  it("ignores deploy and e2b connectors", () => {
    expect(hasLlmConnectorRows([{ kind: "github" }, { kind: "e2b", provider: "" }])).toBe(false);
  });

  it("detects openai-compatible providers", () => {
    expect(hasLlmConnectorRows([{ kind: "openai", provider: "groq" }])).toBe(true);
  });

  it("detects anthropic", () => {
    expect(hasLlmConnectorRows([{ kind: "anthropic", provider: "" }])).toBe(true);
  });
});
