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
  const reduce = useReducedMotion();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Retomar prompt salvo (anônimo → login → home)
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

  // Placeholder typewriter rotativo
  useEffect(() => {
    if (reduce) {
      setPhText(PLACEHOLDERS[0]);
      return;
    }
    const full = PLACEHOLDERS[phIndex];
    let i = 0;
    let dir: 1 | -1 = 1;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += dir;
      setPhText(full.slice(0, i));
      if (dir === 1 && i >= full.length) {
        timeout = setTimeout(() => { dir = -1; tick(); }, 1800);
        return;
      }
      if (dir === -1 && i <= 0) {
        setPhIndex((n) => (n + 1) % PLACEHOLDERS.length);
        return;
      }
      timeout = setTimeout(tick, dir === 1 ? 38 : 22);
    };
    timeout = setTimeout(tick, 200);
    return () => clearTimeout(timeout);
  }, [phIndex, reduce]);

  const submitWith = async (text: string) => {
    if (!text.trim()) return;
    if (!user) {
      try { localStorage.setItem(PENDING_KEY, text); } catch {}
      navigate({ to: "/auth", search: { next: "/" } as any });
      return;
    }
    setBusy(true);
    try {
      const name = text.split("\n")[0].slice(0, 60) || "Novo projeto";
      const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({ owner_id: user.id, name, slug, description: text.slice(0, 280) })
        .select()
        .single();
      if (pErr || !project) throw pErr ?? new Error("Falha ao criar projeto");

      const { data: conv, error: cErr } = await supabase
        .from("conversations")
        .insert({ project_id: project.id, title: name })
        .select()
        .single();
      if (cErr || !conv) throw cErr ?? new Error("Falha ao criar conversa");

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        role: "user",
        parts: [{ type: "text", text }],
      });

      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar projeto");
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.7, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="mt-12 max-w-[720px] mx-auto"
    >
      <div className="dw-conic-ring dw-breathe rounded-2xl">
        <div className="dw-starlight rounded-[calc(var(--radius)+2px)] border border-border-strong bg-surface/80 backdrop-blur-xl shadow-[var(--shadow-glow)]">
          <Textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitWith(prompt);
            }}
            placeholder={phText || PLACEHOLDERS[0]}
            className="min-h-[112px] border-0 focus-visible:ring-0 resize-none text-[15px] md:text-[16px] shadow-none bg-transparent placeholder:text-muted-foreground/60 p-5"
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-1 gap-3">
            <div className="font-mono text-[11px] text-muted-foreground hidden sm:flex items-center gap-2">
              <Sparkles className="size-3 text-sun" />
              <span>⌘+Enter para começar</span>
            </div>
            <Button
              onClick={() => submitWith(prompt)}
              disabled={!prompt.trim() || busy}
              size="sm"
              className="gap-1.5 dw-pulse-glow"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              Começar a criar
            </Button>
          </div>
        </div>
      </div>

      {/* Chips de sugestão */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setPrompt(c);
              taRef.current?.focus();
            }}
            className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-surface/40 backdrop-blur text-muted-foreground hover:text-foreground hover:border-border-strong hover:bg-surface transition-colors"
          >
            {c}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
