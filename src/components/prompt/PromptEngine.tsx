import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createProjectFromPrompt } from "@/lib/projects.functions";

const QUICK_STARTS = [
  "Landing page para um SaaS de produtividade",
  "Dashboard de analytics com gráficos em tempo real",
  "Editor de fotos colaborativo no browser",
  "Marketplace de cursos online com pagamentos",
  "App de notas com IA tipo Notion",
  "Portfólio cinematográfico para fotógrafo",
];

type Props = {
  size?: "hero" | "compact";
  /** When set, submit just calls this (no navigation/warp). */
  onSubmit?: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

function playWarp() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;pointer-events:none;background:radial-gradient(circle at center,transparent 0%,transparent 35%,#000 90%);opacity:0;transition:opacity 360ms ease-in";
  document.body.appendChild(overlay);
  requestAnimationFrame(() => (overlay.style.opacity = "1"));
  const scene = (window as unknown as { __forgeScene?: { scroll: number } })
    .__forgeScene;
  if (scene) scene.scroll = 1.4;
  return () => {
    const flash = document.createElement("div");
    flash.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:#fff;opacity:0;transition:opacity 80ms";
    document.body.appendChild(flash);
    requestAnimationFrame(() => (flash.style.opacity = "1"));
    setTimeout(() => {
      overlay.remove();
      flash.style.opacity = "0";
      setTimeout(() => flash.remove(), 400);
    }, 220);
  };
}

export function PromptEngine({
  size = "hero",
  onSubmit,
  placeholder = "Ask Forge to build…",
  autoFocus = false,
}: Props) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState<"forge-1" | "forge-pro">("forge-1");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const createProject = useServerFn(createProjectFromPrompt);

  // auto-grow
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = size === "hero" ? 220 : 160;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [value, size]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  async function submit(text?: string) {
    const v = (text ?? value).trim();
    if (!v || busy) return;
    if (onSubmit) {
      onSubmit(v);
      setValue("");
      return;
    }

    // Require auth before creating a project
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      try {
        sessionStorage.setItem("forge.initialPrompt", v);
      } catch { /* ignore */ }
      navigate({ to: "/auth", search: { next: "/" } as never });
      return;
    }

    setBusy(true);
    const finishWarp = playWarp();
    try {
      const res = await createProject({ data: { prompt: v } });
      navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
    } catch (e) {
      finishWarp();
      const msg = e instanceof Error ? e.message : "Falha ao criar projeto";
      toast.error(msg);
      setBusy(false);
    }
  }


  const hero = size === "hero";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: hero ? 1.0 : 0, type: "spring", stiffness: 90, damping: 16 }}
      className={`w-full ${hero ? "max-w-2xl mx-auto mt-12" : ""}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="prompt-card p-4 md:p-5"
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className={`w-full bg-transparent border-0 outline-none resize-none placeholder:text-[var(--text-ghost)] text-[var(--foreground)] ${
            hero ? "text-base md:text-lg" : "text-sm md:text-base"
          } leading-relaxed`}
          style={{ minHeight: hero ? "56px" : "44px" }}
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[var(--text-dim)]">
            <button
              type="button"
              data-cursor="hover"
              aria-label="Attach"
              className="p-2 rounded-full hover:bg-white/5 hover:text-[var(--foreground)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              type="button"
              data-cursor="hover"
              onClick={() => setModel((m) => (m === "forge-1" ? "forge-pro" : "forge-1"))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-mono tracking-[0.15em] uppercase hover:bg-white/5 hover:text-[var(--foreground)] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              {model}
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-mono tracking-[0.15em] uppercase text-[var(--text-ghost)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
              </svg>
              Public
            </span>
          </div>

          <button
            type="submit"
            data-cursor="hover"
            disabled={!value.trim()}
            className="prompt-submit"
            aria-label="Submit prompt"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>

      {hero && (
        <div className="mt-5 flex flex-wrap gap-2 justify-center">
          {QUICK_STARTS.slice(0, 4).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              data-cursor="hover"
              className="prompt-chip"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
