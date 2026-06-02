import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  useEffect(() => {
    if (!inView) return;
    const dur = 1800;
    const start = performance.now();
    let raf = 0;
    function tick(t: number) {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);
  const display =
    value >= 1_000_000
      ? (n / 1_000_000).toFixed(1) + "M"
      : value >= 1000
      ? Math.floor(n / 1000) + "K"
      : n;
  return (
    <span ref={ref} className="text-gradient">
      {display}
      {suffix}
    </span>
  );
}

export function Stats() {
  const items = [
    { v: 5_000_000, s: "+", label: "projetos lançados" },
    { v: 180_000, s: "+", label: "builders ativos" },
    { v: 99.9, s: "%", label: "uptime global" },
  ];
  return (
    <section className="relative z-10 py-32 px-6 scanlines">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10 text-center">
        {items.map((it, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: i * 0.12 }}
          >
            <div className="font-display font-bold text-[clamp(3.5rem,10vw,8rem)] leading-none tracking-tight">
              {it.s === "%" ? (
                <span className="text-gradient">{it.v}%</span>
              ) : (
                <Counter value={it.v} suffix={it.s} />
              )}
            </div>
            <p className="mt-4 font-mono text-xs tracking-[0.3em] uppercase text-[var(--text-dim)]">
              {it.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
