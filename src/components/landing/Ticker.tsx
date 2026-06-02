export function Ticker() {
  const items = [
    "// SEQUÊNCIA DE LANÇAMENTO",
    "DEPLOY EM 12s",
    "EDGE NETWORK",
    "REACT · VITE · TS",
    "STREAMING AI",
    "ZERO CONFIG",
    "GLOBAL CDN",
    "INFINITE CANVAS",
  ];
  const all = [...items, ...items, ...items];
  return (
    <section className="relative z-10 py-10 border-y border-[var(--border)] overflow-hidden glass">
      <div className="marquee-track gap-12 font-mono text-sm tracking-[0.3em] uppercase text-[var(--text-dim)]">
        {all.map((t, i) => (
          <span key={i} className="flex items-center gap-12 shrink-0">
            <span className={i % 3 === 0 ? "text-[var(--primary)]" : ""}>{t}</span>
            <span className="text-[var(--primary)]/40">✦</span>
          </span>
        ))}
      </div>
    </section>
  );
}
