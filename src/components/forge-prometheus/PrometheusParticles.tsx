/**
 * PrometheusParticles — Fork of CinemaParticles with blue/graph theme
 * BUG 5 FIX: Throttle mousemove to ~60ms intervals
 */
import { useMemo, useEffect, useRef, useState, useCallback } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  delay: number;
}

export function PrometheusParticles() {
  const particles = useMemo<Particle[]>(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 25 + 12,
      opacity: Math.random() * 0.35 + 0.05,
      delay: Math.random() * 12,
    }))
  , []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const lastUpdateRef = useRef(0);

  // BUG 5 FIX: Throttled mousemove handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < 60) return; // ~16fps max
    lastUpdateRef.current = now;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full ps-animate-float"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.id % 5 === 0 ? "var(--ps-purple)" : "var(--ps-accent)",
            opacity: p.opacity,
            "--ps-particle-op": p.opacity,
            "--ps-float-dur": `${p.speed}s`,
            "--ps-float-delay": `${p.delay}s`,
          } as React.CSSProperties}
        />
      ))}

      {/* Mouse-reactive glow */}
      <div
        className="absolute w-[500px] h-[500px] transition-all duration-1000 ease-out"
        style={{
          left: `${mousePos.x}%`,
          top: `${mousePos.y}%`,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Scanline */}
      <div
        className="absolute left-0 right-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.04), transparent)",
          animation: "ps-scanline 8s linear infinite 2s",
        }}
      />

      {/* Aurora blobs — blue theme */}
      <div className="ps-aurora-bg">
        <div className="ps-aurora-blob" style={{ width: 400, height: 400, top: "-10%", left: "20%", background: "rgba(59,130,246,0.08)" }} />
        <div className="ps-aurora-blob" style={{ width: 300, height: 300, bottom: "10%", right: "15%", background: "rgba(139,92,246,0.06)", animationDelay: "-7s", animationDuration: "25s" }} />
        <div className="ps-aurora-blob" style={{ width: 200, height: 200, top: "40%", left: "60%", background: "rgba(52,211,153,0.04)", animationDelay: "-14s", animationDuration: "30s" }} />
      </div>

      {/* Corner radial gradients */}
      <div className="absolute top-0 left-0 w-[50vw] h-[50vh]"
        style={{ background: "radial-gradient(ellipse at top left, rgba(59,130,246,0.05) 0%, transparent 60%)" }} />
      <div className="absolute bottom-0 right-0 w-[40vw] h-[40vh]"
        style={{ background: "radial-gradient(ellipse at bottom right, rgba(139,92,246,0.04) 0%, transparent 60%)" }} />
    </div>
  );
}
