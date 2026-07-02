import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateExtractionCapabilities } from "./resolve-extraction-capabilities.ts";

Deno.test("G1 — shallow sem scrape provider retorna missing_web_scrape_provider", () => {
  const result = evaluateExtractionCapabilities({
    depth: "shallow",
    preferences: { mode: "fixed", fixedPresetId: "anthropic--claude-sonnet-4-6" },
    connectorKeys: { ANTHROPIC_API_KEY: "sk-ant-test" },
    e2bApiKey: null,
    webScrapeConnectorToken: null,
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "missing_web_scrape_provider");
    assertEquals(result.message.includes("/api-models"), true);
  }
});

Deno.test("G1 — deep sem E2B retorna missing_e2b", () => {
  const result = evaluateExtractionCapabilities({
    depth: "deep",
    preferences: { mode: "fixed", fixedPresetId: "anthropic--claude-sonnet-4-6" },
    connectorKeys: { ANTHROPIC_API_KEY: "sk-ant-test" },
    e2bApiKey: null,
    webScrapeConnectorToken: null,
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "missing_e2b");
  }
});