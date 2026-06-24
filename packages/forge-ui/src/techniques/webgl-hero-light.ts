import type { Technique } from "./types";

/**
 * WebGLHeroLight — luz volumétrica / glow 3D no hero via three.js (peer optional).
 * Feature flag: só ativa em desktop com GPU decente. Fallback CSS gradient.
 * Nunca bloqueie LCP — carregue o canvas lazy após paint.
 */
export const WEBGL_HERO_LIGHT: Technique = {
  id: "webgl-hero-light",
  name: "WebGLHeroLight",
  concept: "Luz volumétrica 3D no hero — glow orgânico que reage ao scroll ou cursor, sensação de produto high-end.",
  whenToUse: "Heroes premium, launches, portfolios tech. Feature flag obrigatório: fallback CSS em mobile e prefers-reduced-motion.",
  pairsWith: ["parallax-depth", "glassmorphism-layers", "spotlight-cursor"],
  primitives: [],
  reference: `import { useEffect, useRef, useState, type ReactNode } from "react";

type WebGLHeroLightProps = {
  children: ReactNode;
  /** Ative só quando o projeto já tem three como peer dep. */
  enableWebGL?: boolean;
};

export function WebGLHeroLight({ children, enableWebGL = true }: WebGLHeroLightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [useWebGL, setUseWebGL] = useState(false);

  useEffect(() => {
    if (!enableWebGL) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(max-width: 768px)").matches) return;

    // Feature flag simples: só desktop com motion ok.
    setUseWebGL(true);
  }, [enableWebGL]);

  useEffect(() => {
    if (!useWebGL || !canvasRef.current) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      if (cancelled || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
      camera.position.z = 4;

      const geometry = new THREE.SphereGeometry(1.2, 32, 32);
      const material = new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.35,
      });
      const orb = new THREE.Mesh(geometry, material);
      scene.add(orb);

      const light = new THREE.PointLight(0xa78bfa, 2, 10);
      light.position.set(2, 1, 3);
      scene.add(light);

      let raf = 0;
      const animate = (time: number) => {
        orb.rotation.y = time * 0.00015;
        orb.rotation.x = Math.sin(time * 0.0002) * 0.15;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      const onResize = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [useWebGL]);

  return (
    <section className="relative min-h-dvh overflow-hidden">
      {useWebGL ? (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          aria-hidden
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at 50% 30%, var(--color-brand-500) 0%, transparent 55%), radial-gradient(circle at 80% 70%, var(--color-accent-500) 0%, transparent 40%)",
            opacity: 0.4,
          }}
          aria-hidden
        />
      )}
      <div className="relative z-10">{children}</div>
    </section>
  );
}`,
};