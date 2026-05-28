import { useEffect, useRef } from "react";

/**
 * Glow radial que segue o cursor — sutil, só desktop.
 * Desliga em prefers-reduced-motion ou em telas táteis.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.transform = `translate3d(${cx - 250}px, ${cy - 250}px, 0)`;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-0 hidden md:block"
      style={{
        width: 500,
        height: 500,
        background:
          "radial-gradient(circle at center, oklch(0.86 0.16 85 / 0.08), transparent 60%)",
        mixBlendMode: "screen",
        filter: "blur(20px)",
      }}
      ref={ref}
    />
  );
}
