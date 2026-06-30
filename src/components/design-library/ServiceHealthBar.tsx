import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Globe,
  Box,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { AgentPreferences } from "@/lib/agent-preferences";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

/* ------------------------------------------------------------------ */
/*  Known LLM provider IDs (mirrors ai-provider-registry + custom-*)   */
/* ------------------------------------------------------------------ */

const LLM_PROVIDER_IDS = new Set<string>([
  "alibaba", "anthropic", "deepseek", "gemini", "groq",
  "minimax", "moonshotai", "nvidia", "ollama", "openai",
  "openrouter", "xai", "xiaomi",
]);

function isLlmProvider(provider: string): boolean {
  if (LLM_PROVIDER_IDS.has(provider)) return true;
  if (provider.startsWith("custom-")) return true;
  return false;
}

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

      // LLM — fix: check provider field instead of kind field.
      // The user's connector (e.g. Mercury 2 / Inception) may have kind "openai"
      // but its provider is the real identifier (e.g. "anthropic", "openrouter", etc.)
      const hasLlmConnector = rows.some((r) => {
        const p = String(r.provider ?? r.kind ?? "").trim();
        return isLlmProvider(p);
      });
      const prefsOk = isAgentPreferencesConfigured(prefs);
      if (prefsOk && hasLlmConnector) {
        // Find the actual LLM provider name for display
        const llmRow = rows.find((r) => {
          const p = String(r.provider ?? r.kind ?? "").trim();
          return isLlmProvider(p);
        });
        const llmProvider = String(llmRow?.provider ?? llmRow?.kind ?? "configurado").trim();
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
          detail: `${llmProvider}${modeLabel ? ` · ${modeLabel}` : ""}`,
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

  // Button icon based on overall status
  const statusIcon = loading ? (
    <Loader2 className="size-3 animate-spin" />
  ) : allOk ? (
    <ShieldCheck className="size-3 text-green-500" />
  ) : anyMissing ? (
    <ShieldAlert className="size-3 text-red-500" />
  ) : (
    <Activity className="size-3 text-muted-foreground" />
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[10px]"
          title="Status dos serviços"
        >
          {statusIcon}
          {!loading && (
            <span
              className={`tabular-nums ${
                allOk ? "text-green-500" : anyMissing ? "text-red-400" : "text-muted-foreground"
              }`}
            >
              {okCount}/{totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2" align="end">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Serviços
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
            <span className="text-[10px] text-muted-foreground">Verificando...</span>
          </div>
        ) : (
          checks.map((c) => (
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
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 ${
                      c.status === "ok"
                        ? "border-green-500/30 text-green-500"
                        : "border-red-500/30 text-red-500"
                    }`}
                  >
                    {c.status === "ok" ? "OK" : "FALTANDO"}
                  </Badge>
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
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
