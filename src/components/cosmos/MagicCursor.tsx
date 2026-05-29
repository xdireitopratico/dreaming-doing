import { useEffect, useRef } from "react";

/**
 * Cursor mágico: anel + ponto, magnetismo em [data-magnetic], trilha de faíscas.
 * Desliga em pointer:coarse ou prefers-reduced-motion.
 */
export function MagicCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ring = ringRef.current;
    const dot = dotRef.current;
    const canvas = trailRef.current;
    if (!ring || !dot || !canvas) return;

    document.body.setAttribute("data-magic-cursor", "on");

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let dx = tx;
    let dy = ty;
    let hovered: HTMLElement | null = null;

    type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number };
    const sparks: Spark[] = [];

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;

      const el = e.target as HTMLElement;
      const magnet = el?.closest?.("[data-magnetic], a, button") as HTMLElement | null;
      hovered = magnet;

      // emit sparks
      if (sparks.length < 30 && Math.random() > 0.4) {
        sparks.push({
          x: e.clientX, y: e.clientY,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8 - 0.3,
          life: 0, max: 40 + Math.random() * 30,
        });
      }
    };

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      // magnetism
      let targetX = tx;
      let targetY = ty;
      if (hovered) {
        const r = hovered.getBoundingClientRect();
        const mx = r.left + r.width / 2;
        const my = r.top + r.height / 2;
        targetX = tx + (mx - tx) * 0.35;
        targetY = ty + (my - ty) * 0.35;
      }
      cx += (targetX - cx) * 0.18;
      cy += (targetY - cy) * 0.18;
      dx += (tx - dx) * 0.5;
      dy += (ty - dy) * 0.5;

      const scale = hovered ? 1.6 : 1;
      ring.style.transform = `translate3d(${cx - 16}px, ${cy - 16}px, 0) scale(${scale})`;
      dot.style.transform = `translate3d(${dx - 2}px, ${dy - 2}px, 0)`;

      // sparks render
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.02;
        const alpha = 1 - s.life / s.max;
        if (alpha <= 0) { sparks.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.6 * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 150, ${alpha * 0.9})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(255, 200, 100, 0.8)";
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      document.body.removeAttribute("data-magic-cursor");
    };
  }, []);

  return (
    <>
      <canvas
        ref={trailRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[90] hidden md:block"
        style={{ mixBlendMode: "screen" }}
      />
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[91] hidden md:block transition-[width,height] duration-200"
        style={{
          width: 32,
          height: 32,
          border: "1.5px solid oklch(0.86 0.16 85 / 0.9)",
          borderRadius: "50%",
          mixBlendMode: "difference",
          willChange: "transform",
        }}
      />
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[92] hidden md:block"
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "white",
          mixBlendMode: "difference",
          willChange: "transform",
        }}
      />
    </>
  );
}
