import { useEffect } from "react";
import Lenis from "lenis";

export function useLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    let raf = 0;
    function frame(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, max)));
      const scene = (window as unknown as { __forgeScene?: { scroll: number } })
        .__forgeScene;
      if (scene) scene.scroll = p * 1.4;
    }
    lenis.on("scroll", onScroll);
    onScroll();

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}
