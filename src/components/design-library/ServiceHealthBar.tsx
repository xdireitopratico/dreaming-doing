import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Brain,
  Globe,
  Box,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentPreferences } from "@/lib/agent-preferences";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ServiceStatus = "ok" | "missing" | "loading";

interface ServiceCheck {
  key: string;
  icon: React.ReactNode;
  label: string;
  status: ServiceStatus;
  detail: string;
  href?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ServiceHealthBar() {
  const [expanded, setExpanded] = useState(false);
  const [checks, setChecks] = useState<ServiceCheck[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setChecks([]);
        return;
      }

      const [connRes, profRes] = await Promise.all([
        supabase
          .from("connectors")
          .select("kind, provider, meta")
          .eq("owner_id", user.id),
        supabase
          .from("profiles")
          .select("agent_preferences")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const rows = (connRes.data ?? []) as Array<{
        kind: string | null;
        provider?: string | null;
        meta?: Record<string, unknown> | null;
      }>;

      const rawPrefs =
        (profRes.data as Record<string, unknown> | null)?.agent_preferences;
      const prefs = (rawPrefs && typeof rawPrefs === "object"
        ? (rawPrefs as AgentPreferences)
        : {}) as AgentPreferences;

      const hasKind = (kind: string) =>
        rows.some((r) => r.kind === kind);
      const providerName = (kind: string) => {
        const row = rows.find((r) => r.kind === kind);
        return row?.provider ?? null;
      };

      const newChecks: ServiceCheck[] = [];

      // LLM — precisa de mode configurado + pelo menos 1 connector LLM/agent
      const hasLlmKey = hasKind("llm") || hasKind("agent");
      const prefsOk = isAgentPreferencesConfigured(prefs);
      if (prefsOk && hasLlmKey) {
        const modeLabel =
          prefs.mode === "auto"
            ? `Auto · ${(prefs.autoAllowedPresetIds?.length ?? 0)} modelo(s)`
            : prefs.mode === "robin"
              ? `ROBIN · ${(prefs.poolProvider ?? "").toUpperCase()}`
              : prefs.mode === "fixed"
                ? "Fixo"
                : "";
        newChecks.push({
          key: "llm",
          icon: <Brain className="size-3.5" />,
          label: "LLM",
          status: "ok",
          detail: modeLabel,
        });
      } else {
        newChecks.push({
          key: "llm",
          icon: <Brain className="size-3.5" />,
          label: "LLM",
          status: "missing",
          detail: !prefsOk
            ? "Configure o modo em /api-models"
            : "Nenhuma chave LLM salva",
          href: "/api-models",
        });
      }

      // Web Scrape
      const hasScrape = hasKind("web_scrape");
      const scrapeProvider = prefs.webScrapeProvider || providerName("web_scrape");
      newChecks.push({
        key: "scrape",
        icon: <Globe className="size-3.5" />,
        label: "Scrape",
        status: hasScrape ? "ok" : "missing",
        detail: hasScrape
          ? `Provider: ${scrapeProvider ?? "configurado"}`
          : "Nenhum connector de Web Scrape",
        href: hasScrape ? undefined : "/api-models",
      });

      // E2B Sandbox
      const hasE2b = hasKind("e2b");
      newChecks.push({
        key: "e2b",
        icon: <Box className="size-3.5" />,
        label: "E2B",
        status: hasE2b ? "ok" : "missing",
        detail: hasE2b
          ? "Sandbox conectada"
          : "Nenhuma chave E2B salva",
        href: hasE2b ? undefined : "/api-models",
      });

      setChecks(newChecks);
    } catch (err) {
      console.warn("[ServiceHealthBar] failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const okCount = checks.filter((c) => c.status === "ok").length;
  const totalCount = checks.length;
  const allOk = totalCount > 0 && okCount === totalCount;
  const anyMissing = checks.some((c) => c.status === "missing");

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-surface-1">
        <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
        <span className="text-[10px] text-muted-foreground">
          Verificando serviços...
        </span>
      </div>
    );
  }

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-border bg-surface-1">
      {/* Collapsed summary row — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-surface-2/50 transition-colors text-left"
      >
        <Chevron className="size-3 text-muted-foreground" />

        <div className="flex items-center gap-1.5 shrink-0">
          {allOk ? (
            <ShieldCheck className="size-3.5 text-green-500" />
          ) : anyMissing ? (
            <ShieldAlert className="size-3.5 text-red-500" />
          ) : (
            <Activity className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-[10px] font-medium text-muted-foreground">
            Serviços
          </span>
        </div>

        {/* Compact dots + labels */}
        <div className="flex items-center gap-3 overflow-x-auto">
          {checks.map((c) => (
            <div key={c.key} className="flex items-center gap-1 shrink-0">
              <span
                className={`inline-block size-2 rounded-full ${
                  c.status === "ok"
                    ? "bg-green-500"
                    : c.status === "missing"
                      ? "bg-red-500"
                      : "bg-muted-foreground/30"
                }`}
              />
              <span
                className={`text-[10px] ${
                  c.status === "ok"
                    ? "text-green-600"
                    : c.status === "missing"
                      ? "text-red-400"
                      : "text-muted-foreground"
                }`}
              >
                {c.label}
              </span>
            </div>
          ))}
        </div>

        {/* Summary badge */}
        <span
          className={`ml-auto text-[10px] tabular-nums shrink-0 ${
            allOk
              ? "text-green-500"
              : anyMissing
                ? "text-red-400"
                : "text-muted-foreground"
          }`}
        >
          {okCount}/{totalCount}
        </span>
      </button>

      {/* Expanded detail rows */}
      {expanded && (
        <div className="border-t border-border px-4 py-2 space-y-1.5">
          {checks.map((c) => (
            <div key={c.key} className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center justify-center size-6 rounded-md ${
                  c.status === "ok"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {c.icon}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{c.label}</span>
                  {c.status === "ok" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                      OK
                    </span>
                  )}
                  {c.status === "missing" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                      FALTANDO
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {c.detail}
                </p>
              </div>

              {c.href && c.status === "missing" && (
                <a
                  href={c.href}
                  className="text-[10px] text-blue-500 hover:text-blue-400 underline shrink-0"
                >
                  Configurar
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
