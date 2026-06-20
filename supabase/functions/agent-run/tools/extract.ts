// tools/extract.ts — Tool extract_design_dna para o agent-run.
// Expõe ao LLM a capacidade de extrair DesignDNA estruturado de URLs.
// Modo shallow (grátis, Plan mode) e deep (Playwright no sandbox, Build mode).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { ToolRegistry } from "../registry.ts";
import { logger } from "../../_shared/logger.ts";

export interface ExtractToolsContext {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  /** Sandbox exec URL (disponível apenas no Build mode) */
  sandboxExecUrl?: string;
  sandboxToken?: string;
  /** LLM config para especialista */
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

export function registerExtractTools(reg: ToolRegistry, ctx: ExtractToolsContext): void {
  reg.register(
    {
      name: "extract_design_dna",
      description:
        "Extrai DesignDNA estruturado de 1-5 URLs de referência. " +
        "Retorna layout, motion, typography, color_application, component_patterns e interactions. " +
        "Modo shallow (grátis, HTTP+Jina+thum.io): funciona no Plan mode, extrai DNA parcial. " +
        "Modo deep (pago, Playwright no sandbox): só no Build mode, extrai CSS computado + motion traces. " +
        "Use para analisar sites que o usuário forneceu ou que você encontrou via web_research. " +
        "O DNA extraído é auto-adicionado ao store para uso na síntese de design.",
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
              "shallow (default): grátis, HTTP+Jina+thum.io, extrai DNA parcial (sem motion/interactions reais). " +
              "deep: pago, Playwright no sandbox (Build mode only), extrai CSS computado + motion traces + hover states. " +
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
        const urls = Array.isArray(args.urls) ? args.urls.filter((u) => typeof u === "string" && u.trim()) : [];
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

        const depth = (args.depth as string) ?? "shallow";
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

        // Chama a edge function extract-design-dna
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const response = await fetch(`${supabaseUrl}/functions/v1/extract-design-dna`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            urls,
            depth,
            categories,
            projectId: ctx.projectId,
            sandboxExecUrl: ctx.sandboxExecUrl,
            sandboxToken: ctx.sandboxToken,
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
          dnasExtracted: result.dnas?.length ?? 0,
          errors: result.errors?.length ?? 0,
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
