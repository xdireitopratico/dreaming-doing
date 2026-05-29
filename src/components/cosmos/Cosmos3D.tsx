import { Suspense, lazy, useEffect, useState } from "react";

const SceneInner = lazy(() => import("./CosmosScene").then((m) => ({ default: m.CosmosScene })));

/**
 * Wrapper SSR-safe do canvas R3F. Carrega apenas no cliente,
 * fallback é um gradiente estático e cobre prefers-reduced-motion.
 */
export function Cosmos3D() {
  const [mounted, setMounted] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ background: "var(--gradient-cosmos)" }}
    >
      <div className="absolute inset-0" style={{ background: "var(--gradient-aurora)" }} />
      {mounted && !reduce && (
        <Suspense fallback={null}>
          <SceneInner />
        </Suspense>
      )}
    </div>
  );
}
