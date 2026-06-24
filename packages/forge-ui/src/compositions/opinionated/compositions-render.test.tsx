import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COMPOSITIONS,
  HeroEditorialSplit,
  HeroBrutalistTypography,
  HeroCinematicSpotlight,
  StickyStackNarrative,
  BentoDenseShowcase,
  EditorialMagazineSplit,
  KineticHeadlineReveal,
  SpotlightShowcaseGrid,
  ParallaxProductShowcase,
  GlassNavFloating,
  GrainArtisanalOverlay,
  SectionTabsFeatureLanes,
  ProcessStepsHowItWorks,
  FAQAccordionCraft,
  InteractiveHeroDemo,
} from "../../composites/index";

const visual = createElement("div", null, "Visual");
const demo = createElement("div", null, "Demo");
const logo = createElement("span", null, "Logo");

function renderSmoke(name: string, element: ReactNode): void {
  expect(() => renderToStaticMarkup(element), `${name} should render without throwing`).not.toThrow();
}

describe("Opinionated compositions — render smoke", () => {
  it("catálogo index exporta 15 composições", () => {
    expect(COMPOSITIONS).toHaveLength(15);
  });

  it("HeroEditorialSplit renderiza com props mínimas", () => {
    renderSmoke(
      "HeroEditorialSplit",
      createElement(HeroEditorialSplit, {
        title: "Editorial hero",
        primaryCta: { label: "Get started" },
      }),
    );
  });

  it("HeroBrutalistTypography renderiza com props mínimas", () => {
    renderSmoke(
      "HeroBrutalistTypography",
      createElement(HeroBrutalistTypography, {
        title: "Brutalist type",
      }),
    );
  });

  it("HeroCinematicSpotlight renderiza com props mínimas", () => {
    renderSmoke(
      "HeroCinematicSpotlight",
      createElement(HeroCinematicSpotlight, {
        title: "Cinematic spotlight",
        primaryCta: { label: "Explore" },
      }),
    );
  });

  it("StickyStackNarrative renderiza com props mínimas", () => {
    renderSmoke(
      "StickyStackNarrative",
      createElement(StickyStackNarrative, {
        stickyTitle: "Sticky title",
        stickyDescription: "Sticky description",
        items: [{ id: "1", title: "Item one", description: "First item" }],
      }),
    );
  });

  it("BentoDenseShowcase renderiza com props mínimas", () => {
    renderSmoke(
      "BentoDenseShowcase",
      createElement(BentoDenseShowcase, {
        cards: [{ id: "1", title: "Card one" }],
      }),
    );
  });

  it("EditorialMagazineSplit renderiza com props mínimas", () => {
    renderSmoke(
      "EditorialMagazineSplit",
      createElement(EditorialMagazineSplit, {
        headline: "Magazine headline",
        visual,
      }),
    );
  });

  it("KineticHeadlineReveal renderiza com props mínimas", () => {
    renderSmoke(
      "KineticHeadlineReveal",
      createElement(KineticHeadlineReveal, {
        words: ["Kinetic", "headline"],
      }),
    );
  });

  it("SpotlightShowcaseGrid renderiza com props mínimas", () => {
    renderSmoke(
      "SpotlightShowcaseGrid",
      createElement(SpotlightShowcaseGrid, {
        items: [{ id: "1", title: "Spotlight item" }],
      }),
    );
  });

  it("ParallaxProductShowcase renderiza com props mínimas", () => {
    renderSmoke(
      "ParallaxProductShowcase",
      createElement(ParallaxProductShowcase, {
        headline: "Parallax product",
        productImage: visual,
      }),
    );
  });

  it("GlassNavFloating renderiza com props mínimas", () => {
    renderSmoke(
      "GlassNavFloating",
      createElement(GlassNavFloating, {
        logo,
        links: [{ label: "Home", href: "/" }],
      }),
    );
  });

  it("GrainArtisanalOverlay renderiza com props mínimas", () => {
    renderSmoke(
      "GrainArtisanalOverlay",
      createElement(GrainArtisanalOverlay, {
        children: createElement("p", null, "Grain content"),
      }),
    );
  });

  it("SectionTabsFeatureLanes renderiza com props mínimas", () => {
    renderSmoke(
      "SectionTabsFeatureLanes",
      createElement(SectionTabsFeatureLanes, {
        title: "Feature lanes",
        lanes: [
          {
            id: "voice",
            label: "Voice",
            headline: "Voice lane",
            description: "Voice capabilities",
          },
        ],
      }),
    );
  });

  it("ProcessStepsHowItWorks renderiza com props mínimas", () => {
    renderSmoke(
      "ProcessStepsHowItWorks",
      createElement(ProcessStepsHowItWorks, {
        title: "How it works",
        steps: [{ id: "1", title: "Step one", description: "First step" }],
      }),
    );
  });

  it("FAQAccordionCraft renderiza com props mínimas", () => {
    renderSmoke(
      "FAQAccordionCraft",
      createElement(FAQAccordionCraft, {
        title: "FAQ",
        items: [{ id: "1", question: "Question?", answer: "Answer." }],
      }),
    );
  });

  it("InteractiveHeroDemo renderiza com props mínimas", () => {
    renderSmoke(
      "InteractiveHeroDemo",
      createElement(InteractiveHeroDemo, {
        title: "Interactive hero",
        primaryCta: { label: "Try demo" },
        demo,
      }),
    );
  });
});