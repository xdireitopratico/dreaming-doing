import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Lenis só na landing — no dashboard o scroll é nativo em .dashboard-main / .dashboard-nav */
function pathnameUsesLenis(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

/**
 * Lenis smooth scroll — só na landing/marketing.
 * Dashboard, auth e editor usam overflow em containers internos.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const useLenis = pathnameUsesLenis(pathname);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!useLenis) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lenis: { raf: (time: number) => void; destroy: () => void } | undefined;
    let raf = 0;
    let cancelled = false;

    (async () => {
      const Lenis = (await import("lenis")).default;
      if (cancelled) return;
      lenis = new Lenis({
        duration: 1.15,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
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
  }, [useLenis]);

  return <>{children}</>;
}
