import { motion } from "framer-motion";

const STEPS = [
  {
    n: "01",
    title: "Descreva sua ideia",
    body: "Escreva em linguagem natural. Sem briefings de 40 páginas, sem wireframes. Apenas a visão.",
    glyph: (
      <svg viewBox="0 0 64 64" className="w-12 h-12">
        <path
          d="M8 16 L56 16 M8 32 L48 32 M8 48 L40 48"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    n: "02",
    title: "FORGE constrói",
    body: "Modelos de fronteira escrevem componentes, lógica, banco de dados e auth — em segundos.",
    glyph: (
      <svg viewBox="0 0 64 64" className="w-12 h-12">
        <polygon
          points="32,6 56,20 56,44 32,58 8,44 8,20"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <circle cx="32" cy="32" r="6" fill="currentColor" />
      </svg>
    ),
  },
  {
    n: "03",
    title: "Lançar para o mundo",
    body: "Deploy global em uma URL. Edição visual ao vivo. Iteração instantânea. Pronto pra escala.",
    glyph: (
      <svg viewBox="0 0 64 64" className="w-12 h-12">
        <path
          d="M32 4 L40 24 L60 28 L44 42 L48 60 L32 50 L16 60 L20 42 L4 28 L24 24 Z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative z-10 py-32 px-6 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-20 text-center">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-[var(--primary)] mb-4">
            // SEQUÊNCIA DE LANÇAMENTO
          </p>
          <h2 className="font-display font-bold text-4xl md:text-6xl tracking-tight">
            Do conceito ao código <span className="text-gradient">em segundos</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* connector line */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[var(--primary)]/40 to-transparent" />
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: 60 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                type: "spring",
                stiffness: 80,
                damping: 14,
                delay: i * 0.15,
              }}
              className="relative glass brackets p-8 rounded-sm"
              data-cursor="hover"
            >
              <div className="flex items-start justify-between mb-6">
                <span className="font-mono text-xs tracking-[0.3em] text-[var(--text-dim)]">
                  STEP / {s.n}
                </span>
                <div className="text-[var(--primary)]">{s.glyph}</div>
              </div>
              <h3 className="font-display font-semibold text-2xl mb-3">{s.title}</h3>
              <p className="font-body text-[var(--text-dim)] leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
