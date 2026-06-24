import type { Technique } from "./types";

export const SMOOTH_SCROLL_LENIS: Technique = {
  id: "smooth-scroll-lenis",
  name: "SmoothScrollLenis",
  concept: "Scroll inercial premium com Lenis — páginas marketing parecem produto craft, não template.",
  whenToUse: "Landings longas, storytelling vertical, hero + seções densas. Respeite prefers-reduced-motion.",
  pairsWith: ["sticky-stack", "scroll-reveal", "parallax-depth"],
  primitives: [],
  reference: `import { useEffect, type ReactNode } from "react";

export function SmoothScrollLenis({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lenis: { raf: (time: number) => void; destroy: () => void } | undefined;
    let raf = 0;
    let cancelled = false;

    (async () => {
      const Lenis = (await import("lenis")).default;
      if (cancelled) return;
      lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      const loop = (time: number) => {
        lenis?.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);

  return <>{children}</>;
}`,
};