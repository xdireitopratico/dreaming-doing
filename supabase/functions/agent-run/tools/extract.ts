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
}

const PLAN_EXTRACT_DNA_QUOTA = 2;

export function registerExtractTools(reg: ToolRegistry, ctx: ExtractToolsContext): void {
  let planExtractCalls = 0;
  reg.register(
    {
      name: "extract_design_dna",
      description:
        "Enfileira a extração de DesignDNA estruturado de 1-5 URLs de referência. " +
        "Retorna layout, motion, typography, color_application, component_patterns e interactions via job assíncrono. " +
        "Modo shallow usa web scrape + limpeza; modo deep usa Playwright no sandbox e pode levar minutos. " +
        "Use para analisar sites que o usuário forneceu ou que você encontrou via web_research. " +
        "O job é auto-adicionado ao store para uso na síntese de design e pode ser acompanhado pelo design library.",
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
          if (planExtractCalls > PLAN_EXTRACT_DNA_QUOTA) {
            return {
              toolCallId: "",
              ok: false,
              error: `Quota Plan: máximo ${PLAN_EXTRACT_DNA_QUOTA} chamadas extract_design_dna por run`,
              output: null,
            };
          }
        }

        let depth = (args.depth as string) ?? "shallow";
        if (ctx.planMode) depth = "shallow";
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

        return {
          toolCallId: "",
          ok: true,
          output: result,
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
}
