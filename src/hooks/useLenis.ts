import { useEffect } from "react";

/**
 * Tracks page scroll progress and pushes it into `window.__forgeScene.scroll`
 * so the 3D SpaceScene can react. Smooth scrolling itself is handled
 * elsewhere (see SmoothScroll provider) — this hook is observer-only to
 * avoid double-initializing Lenis.
 */
export function useLenis() {
  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, max)));
      const scene = (window as unknown as { __forgeScene?: { scroll: number } })
        .__forgeScene;
      if (scene) scene.scroll = p * 1.4;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
}
