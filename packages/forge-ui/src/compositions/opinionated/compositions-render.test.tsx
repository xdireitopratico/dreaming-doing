import { describe, expect, it } from "vitest";
import { SectionTabsFeatureLanes } from "./SectionTabsFeatureLanes";
import { ProcessStepsHowItWorks } from "./ProcessStepsHowItWorks";
import { FAQAccordionCraft } from "./FAQAccordionCraft";
import { InteractiveHeroDemo } from "./InteractiveHeroDemo";

describe("Novas composições P2 — smoke export", () => {
  it("SectionTabsFeatureLanes exporta função", () => {
    expect(typeof SectionTabsFeatureLanes).toBe("function");
  });

  it("ProcessStepsHowItWorks exporta função", () => {
    expect(typeof ProcessStepsHowItWorks).toBe("function");
  });

  it("FAQAccordionCraft exporta função", () => {
    expect(typeof FAQAccordionCraft).toBe("function");
  });

  it("InteractiveHeroDemo exporta função", () => {
    expect(typeof InteractiveHeroDemo).toBe("function");
  });
});