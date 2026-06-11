import { motion } from "framer-motion";
import { useEffect } from "react";
import { PromptEngine } from "@/components/prompt/PromptEngine";
import { ImportRepoDialog } from "@/components/ImportRepoDialog";

export function Hero() {
  useEffect(() => {
    const s = (window as unknown as { __forgeScene?: { scroll: number } }).__forgeScene;
    if (s) s.scroll = 0;
  }, []);

  return (
    <section className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-12 pt-[4.25rem]">
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-5 md:gap-6 -translate-y-[4vh]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.28em] text-[var(--text-ghost)]">
            <span className="live-dot size-1.5 rounded-full bg-[var(--primary)]" />
            FORGE
          </span>

          <h1 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold tracking-tight text-[var(--foreground)]">
            Make Your Dream
          </h1>
        </motion.div>

        <PromptEngine size="hero" />

        <ImportRepoDialog
          trigger={
            <button
              type="button"
              data-cursor="hover"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-ghost)] hover:text-[var(--primary)] transition-colors"
            >
              Importar do GitHub
            </button>
          }
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--text-ghost)]"
        >
          ↓ scroll
        </motion.p>
      </div>
    </section>
  );
}
