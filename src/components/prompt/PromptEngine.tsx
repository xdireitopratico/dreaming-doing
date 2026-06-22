import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { markPendingAgentRun } from "@/lib/agent-auto-run";
import { createProjectFromPrompt } from "@/lib/projects.functions";
import { bootstrapComposerMode } from "@/lib/composer-mode";

import { sanitizeNext } from "@/lib/sanitize-next";
import { MicButton } from "@/components/voice/MicButton";
import { useAuth } from "@/lib/auth";
import { clearForgeTransitionOverlays } from "@/lib/clear-forge-overlays";
import type { ProjectKind } from "@/lib/project-kind";

type Props = {
  size?: "hero" | "compact";
  onSubmit?: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  projectKind?: ProjectKind;
};

function playWarp() {
  clearForgeTransitionOverlays();
  const overlay = document.createElement("div");
  overlay.setAttribute("data-forge-transition", "vignette");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;pointer-events:none;background:radial-gradient(circle at center,transparent 0%,transparent 35%,#000 90%);opacity:0;transition:opacity 280ms ease-in";
  document.body.appendChild(overlay);
  requestAnimationFrame(() => (overlay.style.opacity = "1"));
  const scene = (window as unknown as { __forgeScene?: { scroll: number } }).__forgeScene;
  if (scene) scene.scroll = 1.4;

  const cancel = () => {
    overlay.remove();
    clearForgeTransitionOverlays();
  };

  const finish = () => {
    const flash = document.createElement("div");
    flash.setAttribute("data-forge-transition", "flash");
    flash.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:#fff;opacity:0;transition:opacity 80ms";
    document.body.appendChild(flash);
    requestAnimationFrame(() => (flash.style.opacity = "1"));
    setTimeout(() => {
      cancel();
      flash.style.opacity = "0";
      setTimeout(() => flash.remove(), 400);
    }, 180);
  };

  return { cancel, finish };
}

export function PromptEngine({
  size = "hero",
  onSubmit,
  placeholder = "Ask FORGE to build your dream…",
  autoFocus = false,
  projectKind = "app",
}: Props) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState<"forge-1" | "forge-pro">("forge-1");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const createProject = useServerFn(createProjectFromPrompt);
  const { user, loading: authLoading } = useAuth();
  const needsAuth = !authLoading && !user;

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

  useEffect(() => {
    if (!user) return;
    try {
      const saved = sessionStorage.getItem("forge.initialPrompt");
      if (!saved?.trim()) return;
      sessionStorage.removeItem("forge.initialPrompt");
      setValue(saved);
      void submit(saved);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when user becomes available
  }, [user]);

  async function submit(text?: string) {
    const v = (text ?? value).trim();
    if (!v || busy) return;
    if (onSubmit) {
      onSubmit(v);
      setValue("");
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      try {
        sessionStorage.setItem("forge.initialPrompt", v);
      } catch {
        /* ignore */
      }
      navigate({ to: "/auth", search: { next: sanitizeNext("/") } });
      return;
    }

    setBusy(true);
    const warp = projectKind === "app" ? playWarp() : { cancel: () => {}, finish: () => {} };
    try {
      const res = await createProject({ data: { prompt: v, kind: projectKind } });
      if (projectKind === "app") {
        bootstrapComposerMode(res.projectId, "plan");
        markPendingAgentRun(res.projectId, res.conversationId);
        warp.cancel();
        clearForgeTransitionOverlays();
        navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
      } else {
        warp.cancel();
        navigate({ to: "/agents/$agentId", params: { agentId: res.projectId } });
      }
    } catch (e) {
      warp.finish();
      const msg = e instanceof Error ? e.message : "Falha ao criar projeto";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const hero = size === "hero";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: hero ? 0.35 : 0, type: "spring", stiffness: 90, damping: 16 }}
      className={`w-full ${hero ? "max-w-2xl mx-auto" : ""}`}
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
              onClick={() => setModel((m) => (m === "forge-1" ? "forge-pro" : "forge-1"))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-mono tracking-[0.15em] uppercase hover:bg-white/5 hover:text-[var(--foreground)] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              {model}
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-mono tracking-[0.15em] uppercase text-[var(--text-ghost)]">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
              </svg>
              Public
            </span>
          </div>

          <div className="flex items-center gap-2">
            <MicButton
              size="sm"
              onTranscript={(t) => setValue((cur) => (cur ? `${cur} ${t}` : t))}
            />
            <button
              type="submit"
              data-cursor="hover"
              disabled={!value.trim() || busy}
              className="prompt-submit"
              aria-label={needsAuth ? "Entrar para construir" : "Enviar"}
              title={needsAuth ? "Entrar para construir" : undefined}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </form>

      {needsAuth && value.trim() && (
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-ghost)]">
          <button
            type="button"
            className="text-[var(--primary)] hover:underline"
            onClick={() => {
              try {
                sessionStorage.setItem("forge.initialPrompt", value.trim());
              } catch {
                /* ignore */
              }
              navigate({ to: "/auth", search: { next: sanitizeNext("/") } });
            }}
          >
            Entrar para construir →
          </button>
        </p>
      )}
    </motion.div>
  );
}
