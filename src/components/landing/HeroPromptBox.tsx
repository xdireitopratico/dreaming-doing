import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const PENDING_KEY = "dw-pending-prompt";

const PLACEHOLDERS = [
  "um portfólio fotográfico minimalista, em preto e branco…",
  "um CRM interno com Supabase e roles por equipe…",
  "um painel financeiro pessoal com gráficos animados…",
  "uma landing page para minha padaria artesanal…",
  "um construtor de slides estilo Keynote…",
];

const CHIPS = [
  "Site para meu portfólio",
  "App de receitas com login",
  "Dashboard com Supabase",
  "Landing de produto",
];

export function HeroPromptBox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [phText, setPhText] = useState("");
  const [pulse, setPulse] = useState(0);
  const [warping, setWarping] = useState(false);
  const reduce = useReducedMotion();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = localStorage.getItem(PENDING_KEY);
    if (pending && user) {
      setPrompt(pending);
      localStorage.removeItem(PENDING_KEY);
      setTimeout(() => submitWith(pending), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (reduce) { setPhText(PLACEHOLDERS[0]); return; }
    const full = PLACEHOLDERS[phIndex];
    let i = 0;
    let dir: 1 | -1 = 1;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += dir;
      setPhText(full.slice(0, i));
      if (dir === 1 && i >= full.length) { timeout = setTimeout(() => { dir = -1; tick(); }, 1800); return; }
      if (dir === -1 && i <= 0) { setPhIndex((n) => (n + 1) % PLACEHOLDERS.length); return; }
      timeout = setTimeout(tick, dir === 1 ? 38 : 22);
    };
    timeout = setTimeout(tick, 200);
    return () => clearTimeout(timeout);
  }, [phIndex, reduce]);

  // Spark burst no botão
  const burst = () => {
    const btn = btnRef.current;
    if (!btn || reduce) return;
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.className = "dw-spark";
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 40 + Math.random() * 50;
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--sy", `${Math.sin(angle) * dist}px`);
      s.style.position = "fixed";
      s.style.zIndex = "95";
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  };

  const submitWith = async (text: string) => {
    if (!text.trim()) return;
    burst();
    if (!user) {
      try { localStorage.setItem(PENDING_KEY, text); } catch {}
      // warp transition then redirect
      setWarping(true);
      setTimeout(() => navigate({ to: "/auth", search: { next: "/" } as any }), 600);
      return;
    }
    setBusy(true);
    setWarping(true);
    try {
      const name = text.split("\n")[0].slice(0, 60) || "Novo projeto";
      const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: project, error: pErr } = await supabase
        .from("projects").insert({ owner_id: user.id, name, slug, description: text.slice(0, 280) }).select().single();
      if (pErr || !project) throw pErr ?? new Error("Falha ao criar projeto");

      const { data: conv, error: cErr } = await supabase
        .from("conversations").insert({ project_id: project.id, title: name }).select().single();
      if (cErr || !conv) throw cErr ?? new Error("Falha ao criar conversa");

      await supabase.from("messages").insert({
        conversation_id: conv.id, role: "user", parts: [{ type: "text", text }],
      });

      qc.invalidateQueries({ queryKey: ["projects"] });
      setTimeout(() => navigate({ to: "/projects/$projectId", params: { projectId: project.id } }), 600);
    } catch (e: any) {
      setWarping(false);
      toast.error(e?.message ?? "Erro ao criar projeto");
      setBusy(false);
    }
  };

  return (
    <>
      {warping && <div className="dw-warp" aria-hidden />}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.7, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mt-12 max-w-[720px] mx-auto relative dw-energy-target"
      >
        <div className="dw-energy-halo" />
        <div className="dw-conic-ring dw-breathe rounded-2xl relative">
          <div
            className="dw-starlight rounded-[calc(var(--radius)+2px)] border border-border-strong bg-surface/80 backdrop-blur-xl shadow-[var(--shadow-glow)]"
            style={{
              boxShadow: pulse > 0
                ? `0 0 0 1px oklch(1 0 0 / 0.06), 0 0 ${20 + pulse * 4}px oklch(0.69 0.18 258 / ${0.3 + pulse * 0.05})`
                : undefined,
              transition: "box-shadow 400ms ease",
            }}
          >
            <Textarea
              ref={taRef}
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setPulse((p) => Math.min(p + 1, 6)); setTimeout(() => setPulse((p) => Math.max(p - 1, 0)), 300); }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitWith(prompt); }}
              placeholder={phText || PLACEHOLDERS[0]}
              className="min-h-[112px] border-0 focus-visible:ring-0 resize-none text-[15px] md:text-[16px] shadow-none bg-transparent placeholder:text-muted-foreground/60 p-5"
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1 gap-3">
              <div className="font-mono text-[11px] text-muted-foreground hidden sm:flex items-center gap-2">
                <Sparkles className="size-3 text-sun" />
                <span>⌘+Enter para começar</span>
              </div>
              <Button
                ref={btnRef}
                onClick={() => submitWith(prompt)}
                disabled={!prompt.trim() || busy}
                size="sm"
                data-magnetic
                className="gap-1.5 dw-pulse-glow relative overflow-hidden"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                Começar a criar
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              data-magnetic
              onClick={() => { setPrompt(c); taRef.current?.focus(); }}
              className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-surface/40 backdrop-blur text-muted-foreground hover:text-foreground hover:border-ignition/40 hover:bg-surface transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
