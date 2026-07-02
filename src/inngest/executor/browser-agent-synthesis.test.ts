import { describe, it, expect, vi } from "vitest";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import type { BrowserAgentStep } from "./browser-agent-state";

const baseSteps: BrowserAgentStep[] = [
  {
    stepNumber: 1,
    thought: "Hero full-bleed",
    action: { type: "screenshot", params: {} },
    observation: {
      type: "screenshot",
      url: "https://example.com",
      screenshot: "base64...",
    },
    timestamp: new Date().toISOString(),
  },
  {
    stepNumber: 2,
    thought: "Análise do hero",
    action: { type: "analyze", params: { selector: ".hero" } },
    observation: {
      type: "analyze",
      url: "https://example.com",
      result: { tagName: "SECTION", styles: { color: "#000", fontFamily: "Inter" } },
    },
    timestamp: new Date().toISOString(),
  },
];

describe("synthesizeDesignDNA", () => {
  it("calls LLM and returns parsed DNA", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        name: "Example Site",
        category: "full_page",
        layout: { hero: "full-bleed" },
        color: { primary: "#000" },
        typography: { heading: "Inter" },
        motion: { entrance: "fade-up" },
        interaction: { hover: "scale" },
        component: { hero: "HeroSignature" },
        implementation_notes: "CSS custom props used.",
        quality_score: 9,
        serves_domains: ["saas"],
        compatible_languages: ["editorial"],
        compatible_moods: ["premium"],
      }),
    });

    const result = await synthesizeDesignDNA(baseSteps, "https://example.com", ["hero"], mockLlm);
    expect(mockLlm).toHaveBeenCalledWith(
      expect.stringContaining("https://example.com"),
      "Sintetize o Design DNA final.",
      "data:image/png;base64,base64...",
    );
    expect(result.name).toBe("Example Site");
    expect(result.quality_score).toBe(9);
    expect(result.quality_source).toBe("deep_agent");
    expect(result.layout).toEqual({ hero: "full-bleed" });
    expect(result.color).toEqual({ primary: "#000" });
  });

  it("clamps quality_score between 0 and 10", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        name: "X",
        category: "full_page",
        quality_score: 15,
      }),
    });
    const result = await synthesizeDesignDNA(baseSteps, "https://x.com", ["hero"], mockLlm);
    expect(result.quality_score).toBe(10);
  });

  it("defaults arrays when missing", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        name: "Y",
        category: "full_page",
      }),
    });
    const result = await synthesizeDesignDNA(baseSteps, "https://y.com", ["hero"], mockLlm);
    expect(result.serves_domains).toEqual([]);
    expect(result.compatible_languages).toEqual([]);
    expect(result.compatible_moods).toEqual([]);
  });
});
