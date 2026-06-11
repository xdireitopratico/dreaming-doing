import type { ToolRegistry } from "../registry.ts";
import type { DeployTarget } from "../../_shared/stack-context.ts";
import { executeDeployPublish } from "../../_shared/deploy-publish-core.ts";

export interface DeployToolContext {
  supabase: any;
  projectId: string;
  userId: string;
  deployTarget: DeployTarget;
  hasDeployToken: boolean;
}

export function registerDeployTool(reg: ToolRegistry, ctx: DeployToolContext): void {
  reg.register(
    {
      name: "deploy_publish",
      description:
        "Publica o projeto para produção no alvo configurado (Vercel, Netlify, Cloudflare ou preview E2B). " +
        "Use após build/testes OK. Requer preview ao vivo (E2B) ativo — sem previewUrl retorna needsPreview.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Breve motivo do deploy (ex.: feature X pronta para produção)",
          },
        },
      },
    },
    async (args) => {
      const reason = typeof args.reason === "string" ? args.reason.trim() : "";

      const result = await executeDeployPublish(ctx.supabase, ctx.projectId, ctx.userId);

      if (!result.ok) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: result.error ?? "Falha ao publicar",
        };
      }

      if (result.needsPreview) {
        const hint = ctx.hasDeployToken
          ? `Inicie o preview E2B no editor antes de publicar. Alvo: ${ctx.deployTarget}.`
          : `Sem preview ativo. Conecte ${ctx.deployTarget} em Conectores ou inicie preview E2B.`;
        return {
          toolCallId: "",
          ok: false,
          output: { needsPreview: true, provider: result.provider },
          error: hint,
        };
      }

      return {
        toolCallId: "",
        ok: true,
        output: {
          deploymentId: result.deploymentId,
          url: result.url,
          status: result.status,
          provider: result.provider,
          reason: reason || undefined,
        },
        artifacts: result.url ? [result.url] : [],
      };
    },
  );
}
