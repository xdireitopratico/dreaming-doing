import { describe, expect, it } from "vitest";
import { hasLlmConnectorRows } from "./connector-llm";

describe("hasLlmConnectorRows", () => {
  it("ignores deploy and e2b connectors", () => {
    expect(
      hasLlmConnectorRows([
        { kind: "github" },
        { kind: "e2b", provider: "" },
        { kind: "web_search" },
        { kind: "web_scrape" },
        { kind: "browser_runtime" },
      ]),
    ).toBe(false);
  });

  it("detects openai-compatible providers", () => {
    expect(hasLlmConnectorRows([{ kind: "openai", provider: "groq" }])).toBe(true);
  });

  it("detects anthropic", () => {
    expect(hasLlmConnectorRows([{ kind: "anthropic", provider: "" }])).toBe(true);
  });
});
