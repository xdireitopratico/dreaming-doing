// tools/extract.ts — Tool extract_design_dna para o agent-run.
// Expõe ao LLM a capacidade de extrair DesignDNA estruturado de URLs.
// Modo shallow (grátis, Plan mode) e deep (Playwright no sandbox, Build mode).
// APENAS usuários admin podem extrair DesignDNA (uso de LLM custa créditos da plataforma).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { ToolRegistry } from "../registry.ts";
import { logger } from "../../_shared/logger.ts";

export interface ExtractToolsContext {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  planMode?: boolean;
  sandboxExecUrl?: string;
  sandboxToken?: string;
  /** Chaves de conectores do usuário (para passar LLM config à extração) */
  connectorKeys: Record<string, string>;
  /** Serializa atos do extract pro inspector (dna_ready / background_*). */
  emit?: (type: string, data: unknown) => void;
  /** Budget de wall-clock restante da run (ms) — o poll nunca estoura isso. */
  getRemainingBudgetMs?: () => number;
}

export const PLAN_EXTRACT_DNA_QUOTA = 2;

export function planExtractQuotaError(callIndex: number, planMode: boolean): string | null {
  if (!planMode) return null;
  if (callIndex > PLAN_EXTRACT_DNA_QUOTA) {
    return `Quota Plan: máximo ${PLAN_EXTRACT_DNA_QUOTA} chamadas extract_design_dna por run`;
  }
  return null;
}

export function resolveExtractDepth(planMode: boolean, requested?: string): "shallow" | "deep" {
  if (planMode) return "shallow";
  return requested === "deep" ? "deep" : "shallow";
}

export function registerExtractTools(reg: ToolRegistry, ctx: ExtractToolsContext): void {
  let planExtractCalls = 0;
  reg.register(
    {
      name: "extract_design_dna",
      description:
        "Extrai DesignDNA estruturado de 1-5 URLs de referência e BLOQUEIA até o DNA ficar pronto (shallow ~30-60s, deep até ~150s). " +
        "Devolve o design_dna DIRETO neste resultado (layout, color, typography, motion, interaction, component) — " +
        "NÃO chame read_design_library depois, e NÃO re-chame extract_design_dna para a mesma URL. " +
        "Aplique criativamente (skill extract-design): extraia a intenção/gesto, adapte ao domínio, não copie. " +
        "Se retornar status 'still_running', a extração passou do limite de tempo — continue outro trabalho do plano e retome depois, NÃO faça poll.",
      parameters: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "1-5 URLs para extrair DesignDNA. Podem ser fornecidas pelo usuário ou sugeridas via web_research.",
            maxItems: 5,
          },
          depth: {
            type: "string",
              enum: ["shallow", "deep"],
              description:
              "shallow (default): web scrape limpo, gera job rápido com evidência parcial. " +
              "deep: Playwright no sandbox (Build mode only), extrai CSS computado + motion traces + hover states, em job assíncrono. " +
              "Use shallow no Plan mode. Use deep no Build mode quando precisar de motion/interactions precisos.",
          },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: ["hero", "motion", "typography", "color_application", "components", "interactions"],
            },
            description: "Categorias a extrair. Default: todas.",
          },
        },
        required: ["urls"],
      },
    },
    async (args) => {
      try {
        const urls = Array.isArray(args.urls) ? (args.urls as string[]).filter((u) => u.trim()) : [];
        if (urls.length === 0) {
          return {
            toolCallId: "",
            ok: false,
            error: "extract_design_dna requer pelo menos 1 URL",
            output: null,
          };
        }
        if (urls.length > 5) {
          return {
            toolCallId: "",
            ok: false,
            error: "extract_design_dna aceita no máximo 5 URLs",
            output: null,
          };
        }

        // ── Admin gate ──────────────────────────────────────────
        const { data: role } = await ctx.supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", ctx.userId)
          .eq("role", "admin")
          .maybeSingle();

        if (!role) {
          return {
            toolCallId: "",
            ok: false,
            error: "Apenas administradores podem extrair DesignDNA (uso de LLM custa créditos da plataforma)",
            output: null,
          };
        }

        if (ctx.planMode) {
          planExtractCalls++;
          const quotaErr = planExtractQuotaError(planExtractCalls, true);
          if (quotaErr) {
            return { toolCallId: "", ok: false, error: quotaErr, output: null };
          }
        }

        const depth = resolveExtractDepth(!!ctx.planMode, args.depth as string);
        const categories = Array.isArray(args.categories) ? args.categories : undefined;

        // Deep mode requer sandbox — só disponível no Build
        if (depth === "deep" && !ctx.sandboxExecUrl) {
          return {
            toolCallId: "",
            ok: false,
            error: "Modo deep requer sandbox ativo (Build mode). Use shallow no Plan mode.",
            output: null,
          };
        }

        // Enfileira o job em background para evitar timeout da edge function
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const response = await fetch(`${supabaseUrl}/functions/v1/design-dna-scheduler`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "schedule",
            urls,
            depth,
            categories,
            userId: ctx.userId,
          }),
          signal: AbortSignal.timeout(depth === "deep" ? 120000 : 60000),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          return {
            toolCallId: "",
            ok: false,
            error: `extract_design_dna falhou: HTTP ${response.status} — ${errData.error || "unknown"}`,
            output: null,
          };
        }

        const data = await response.json();
        const result = data.result || data;

        logger.info("agent.extract_design_dna", {
          userId: ctx.userId,
          projectId: ctx.projectId,
          urlCount: urls.length,
          depth,
          queued: !!result.queued,
          jobId: result.jobId,
          eventIds: Array.isArray(result.eventIds) ? result.eventIds.length : 0,
        });

        // ── Poll síncrono adaptativo: bloqueia até o job concluir e devolve o DNA direto.
        // ponytail: mata o loop "Avançar com read ×6" — o LLM chama uma vez, espera, recebe o DNA.
        // Cap adaptativo: nunca estoura o budget restante da run (deixa 20s pra síntese).
        const jobId = (result.jobId as string | undefined) ?? "";
        ctx.emit?.("background_wait", {
          jobId,
          source_url: urls[0],
          etaSec: depth === "shallow" ? 60 : 180,
          reason: "extraindo DesignDNA em background",
        });
        const remaining = ctx.getRemainingBudgetMs?.() ?? 90_000;
        const capMs = Math.max(15_000, Math.min(depth === "shallow" ? 90_000 : 150_000, remaining - 20_000));
        const pollStart = Date.now();
        let jobStatus = "pending";
        while (Date.now() - pollStart < capMs) {
          await new Promise((r) => setTimeout(r, 5000));
          const { data: jobRow } = await ctx.supabase
            .from("design_dna_jobs")
            .select("status")
            .eq("id", jobId)
            .maybeSingle();
          jobStatus = (jobRow?.status as string) ?? "pending";
          if (["completed", "failed", "partial", "blocked"].includes(jobStatus)) break;
        }
        if (jobStatus === "failed" || jobStatus === "blocked") {
          return {
            toolCallId: "",
            ok: false,
            error: `Extração falhou (status: ${jobStatus}). Verifique design_dna_jobs ${jobId}.`,
            output: null,
          };
        }
        if (jobStatus === "completed" || jobStatus === "partial") {
          const { data: dnaRows } = await ctx.supabase
            .from("design_system_library")
            .select("source_url, name, design_dna, quality_score, confidence, compatible_moods, serves_domains")
            .in("source_url", urls);
          const entries = (dnaRows ?? []).map((r: Record<string, unknown>) => ({
            source_url: r.source_url,
            name: r.name,
            design_dna: r.design_dna,
            quality_score: r.quality_score,
            compatible_moods: r.compatible_moods,
            serves_domains: r.serves_domains,
          }));
          const first = (entries[0] as Record<string, unknown>) ?? {};
          const dna = (first.design_dna ?? {}) as Record<string, unknown>;
          ctx.emit?.("dna_ready", {
            source_url: first.source_url ?? urls[0],
            signature:
              typeof dna.signature === "string" ? dna.signature
                : typeof first.name === "string" ? (first.name as string)
                  : "DesignDNA",
            layers: Array.isArray(dna.layers) ? (dna.layers as string[]) : undefined,
          });
          return {
            toolCallId: "",
            ok: true,
            output: {
              status: jobStatus,
              jobId,
              urls,
              entries,
              hint:
                "DNA extraído e pronto (em entries[].design_dna). Aplique criativamente — " +
                "extraia o gesto e a intenção, adapte ao domínio do usuário, NÃO copie. NÃO chame read_design_library.",
            },
          };
        }
        // cap reached — still running: anti-loop explícito
        return {
          toolCallId: "",
          ok: true,
          output: {
            status: "still_running",
            jobId,
            urls,
            hint:
              `Extração ainda rodando em background (passou de ${Math.round(capMs / 1000)}s). Continue outro trabalho do plano; NÃO chame read_design_library, NÃO re-chame extract_design_dna pra mesma URL. O DNA será salvo em design_system_library quando concluir — retome depois.`,
          },
        };
      } catch (err) {
        return {
          toolCallId: "",
          ok: false,
          error: `extract_design_dna falhou: ${(err as Error).message}`,
          output: null,
        };
      }
    },
  );

  reg.register(
    {
      name: "read_design_library",
      description:
        "Lê DesignDNA extraído (salvo por extract_design_dna) da design_system_library. " +
        "Use DEPOIS de extract_design_dna concluir, com a source_url, para VER o que foi extraído " +
        "(layout, color, typography, motion, interaction, component) e aplicar criativamente no design. " +
        "Sem source_url, lista as extrações mais recentes (máx 10).",
      parameters: {
        type: "object",
        properties: {
          source_url: { type: "string", description: "URL exata da referência extraída para ler." },
          limit: { type: "number", description: "Máximo de entradas ao listar (default 5, máx 10)." },
        },
      },
    },
    async (args) => {
      try {
        const sourceUrl = typeof args.source_url === "string" ? args.source_url.trim() : "";
        const limit = Math.min(10, Math.max(1, typeof args.limit === "number" ? args.limit : 5));
        let query = ctx.supabase
          .from("design_system_library")
          .select(
            "source_url, name, quality_score, confidence, screenshot_url, design_dna, clean_html, serves_domains, compatible_languages, compatible_moods, extracted_at",
          );
        if (sourceUrl) {
          query = query.eq("source_url", sourceUrl).limit(1);
        } else {
          query = query.order("extracted_at", { ascending: false }).limit(limit);
        }
        const { data, error } = await query;
        if (error) {
          return {
            toolCallId: "",
            ok: false,
            error: `read_design_library falhou: ${error.message}`,
            output: null,
          };
        }
        const rows = (data ?? []).map((r: Record<string, unknown>) => ({
          source_url: r.source_url,
          name: r.name,
          quality_score: r.quality_score,
          confidence: r.confidence,
          screenshot_url: r.screenshot_url,
          design_dna: r.design_dna,
          clean_html_preview: typeof r.clean_html === "string" ? r.clean_html.slice(0, 2000) : null,
          serves_domains: r.serves_domains,
          compatible_languages: r.compatible_languages,
          compatible_moods: r.compatible_moods,
          extracted_at: r.extracted_at,
        }));
        // Serializa DNA pronto pro inspector (ACT II do simulacro).
        if (rows.length > 0) {
          const first = rows[0] as Record<string, unknown>;
          const dna = (first.design_dna ?? {}) as Record<string, unknown>;
          const signature =
            typeof dna.signature === "string" ? dna.signature
              : typeof first.name === "string" ? first.name
                : "DesignDNA";
          ctx.emit?.("dna_ready", {
            source_url: first.source_url,
            signature,
            layers: Array.isArray(dna.layers) ? (dna.layers as string[]) : undefined,
          });
        }
        return {
          toolCallId: "",
          ok: true,
          output: {
            count: rows.length,
            entries: rows,
            hint:
              rows.length === 0
                ? "Nenhuma entrada — o job de extract_design_dna pode ainda estar rodando, ou a URL não foi extraída. Tente novamente em alguns segundos (shallow) ou minutos (deep)."
                : "Leia o design_dna de cada entrada e aplique criativamente (skill extract-design): extraia o gesto e a intenção, adapte ao domínio, não copie.",
          },
        };
      } catch (err) {
        return {
          toolCallId: "",
          ok: false,
          error: `read_design_library falhou: ${(err as Error).message}`,
          output: null,
        };
      }
    },
  );
}
