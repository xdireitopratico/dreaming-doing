import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { FileCode2, Sparkles } from "lucide-react";

type Step =
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; arg: string }
  | { kind: "assistant"; text: string };

const SCRIPT: Step[] = [
  { kind: "user", text: "Crie uma landing page para uma cafeteria especialty com cardápio e formulário." },
  { kind: "tool", name: "write_file", arg: "index.html" },
  { kind: "tool", name: "write_file", arg: "styles.css" },
  { kind: "tool", name: "write_file", arg: "app.tsx" },
  { kind: "tool", name: "write_file", arg: "menu.json" },
  { kind: "assistant", text: "Pronto. Estrutura criada com hero, cardápio em grid e formulário de contato. Quer ajustar a paleta?" },
];

const FILES = ["index.html", "styles.css", "app.tsx", "menu.json"];

export function LiveEditorDemo() {
  const [shown, setShown] = useState<Step[]>([]);
  const [filesShown, setFilesShown] = useState<string[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      setShown(SCRIPT);
      setFilesShown(FILES);
      return;
    }
    let i = 0;
    const tick = () => {
      i++;
      if (i > SCRIPT.length + 2) {
        setShown([]);
        setFilesShown([]);
        i = 0;
        return;
      }
      const next = SCRIPT.slice(0, Math.min(i, SCRIPT.length));
      setShown(next);
      setFilesShown(
        next.filter((s) => s.kind === "tool").map((s) => (s as any).arg),
      );
    };
    const id = setInterval(tick, 1400);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className="rounded-2xl border border-border bg-surface/60 shadow-[var(--shadow-soft)] overflow-hidden">
      {/* topbar mimetizando o editor */}
      <div className="h-9 border-b border-border bg-background/60 flex items-center px-3 gap-2 text-[11px] text-muted-foreground">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </div>
        <span className="ml-3 font-mono">cafeteria-mvp · live</span>
        <span className="ml-auto inline-flex items-center gap-1 text-primary">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" /> gerando
        </span>
      </div>

      <div className="grid grid-cols-12 min-h-[360px]">
        {/* chat */}
        <div className="col-span-5 border-r border-border p-4 space-y-3 overflow-hidden">
          {shown.map((s, idx) => {
            if (s.kind === "user") {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-primary text-primary-foreground rounded-lg p-2.5 text-[12px] leading-snug ml-4"
                >
                  {s.text}
                </motion.div>
              );
            }
            if (s.kind === "tool") {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-mono text-[11px] text-muted-foreground inline-flex items-center gap-1.5"
                >
                  <span className="text-primary">▸</span> {s.name}(<span className="text-foreground">"{s.arg}"</span>)
                </motion.div>
              );
            }
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-elev border border-border rounded-lg p-2.5 text-[12px] leading-snug mr-4 inline-flex items-start gap-2"
              >
                <Sparkles className="size-3.5 text-primary mt-0.5 shrink-0" />
                <span>{s.text}</span>
              </motion.div>
            );
          })}
        </div>

        {/* file tree */}
        <div className="col-span-3 border-r border-border p-3 bg-background/30">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">arquivos</div>
          {filesShown.length === 0 && <div className="text-[11px] text-muted-foreground italic">aguardando…</div>}
          {filesShown.map((f) => (
            <motion.div
              key={f}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-mono text-[12px] py-0.5 inline-flex items-center gap-1.5"
            >
              <FileCode2 className="size-3 text-muted-foreground" /> {f}
            </motion.div>
          ))}
        </div>

        {/* preview */}
        <div className="col-span-4 bg-[#f8f5f0] text-[#2a1f15] relative overflow-hidden">
          {filesShown.includes("index.html") ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 p-4 flex flex-col"
            >
              <div className="text-[8px] uppercase tracking-widest opacity-50 mb-1">Café Norte</div>
              <div className="font-display text-[22px] leading-none">Grãos especiais, métodos justos.</div>
              <div className="text-[9px] mt-2 opacity-70">Cardápio · Sobre · Visite</div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[9px]">
                {["Espresso", "Aeropress", "V60", "Cold brew"].map((n) => (
                  <div key={n} className="bg-white/60 border border-black/10 rounded p-1.5">
                    <div className="font-medium">{n}</div>
                    <div className="opacity-60">R$ 12</div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="h-full grid place-items-center text-[10px] text-foreground/40">preview ao vivo</div>
          )}
        </div>
      </div>
    </div>
  );
}
