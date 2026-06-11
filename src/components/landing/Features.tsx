import { motion } from "framer-motion";

const FEATURES = [
  {
    t: "AI nativo",
    d: "Geração de código com modelos de fronteira, otimizada para produção.",
    k: "AI",
  },
  { t: "Backend integrado", d: "Auth, DB Postgres e storage prontos com um clique.", k: "DB" },
  { t: "Edge deploy", d: "Global, instantâneo, sem servidores pra gerenciar.", k: "EDGE" },
  { t: "Editor visual", d: "Edite componentes ao vivo, com preview lado a lado.", k: "UI" },
  { t: "Versionamento", d: "Cada prompt vira um commit. Reverta a qualquer momento.", k: "GIT" },
  {
    t: "Open by default",
    d: "Exporte para GitHub, conecte domínio, custodie seu código.",
    k: "OSS",
  },
];

export function Features() {
  return (
    <section id="features" className="relative z-10 py-32 px-6 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16 max-w-2xl">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-[var(--primary)] mb-4">
            // PAYLOAD MANIFEST
          </p>
          <h2 className="font-display font-bold text-4xl md:text-5xl tracking-tight">
            Uma plataforma completa, <span className="text-gradient-cool">ativa em um prompt</span>.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.t}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                type: "spring",
                stiffness: 90,
                damping: 16,
                delay: i * 0.08,
              }}
              whileHover={{ y: -8 }}
              data-cursor="hover"
              className="group relative glass p-7 rounded-sm border border-[var(--border)] hover:border-[var(--primary)]/40 transition-colors"
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-sm"
                style={{
                  boxShadow: "inset 0 0 60px rgba(255,107,53,0.06), 0 0 40px rgba(255,107,53,0.12)",
                }}
              />
              <div className="flex items-center justify-between mb-5">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-dim)] border border-[var(--border)] px-2 py-1">
                  {f.k}
                </span>
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] group-hover:shadow-[0_0_10px_var(--primary)] transition-shadow" />
              </div>
              <h3 className="font-display font-semibold text-xl mb-2 group-hover:text-[var(--primary)] transition-colors">
                {f.t}
              </h3>
              <p className="font-body text-sm text-[var(--text-dim)] leading-relaxed">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
