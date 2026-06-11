import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { ToolRegistry } from "../registry.ts";
import type { ToolResult } from "../types.ts";

const CONNECTORS = ["github", "vercel", "supabase", "netlify", "cloudflare"] as const;

export type TasteUiEmit = (type: string, data: Record<string, unknown>) => void;

export function registerTasteTools(
  reg: ToolRegistry,
  ctx: { supabase: SupabaseClient; userId: string; emit: TasteUiEmit },
): void {
  reg.register(
    {
      name: "suggest_connector",
      description:
        "Abre no editor o guia de conexão (github, vercel, supabase, netlify, cloudflare). E2B e chaves de IA ficam em API Keys (/api).",
      parameters: {
        type: "object",
        properties: {
          connector: { type: "string", enum: [...CONNECTORS] },
          reason: { type: "string", description: "Por que este conector ajuda (1 frase)" },
        },
        required: ["connector", "reason"],
      },
    },
    async (args): Promise<ToolResult> => {
      const connector = String(args.connector ?? "").toLowerCase();
      if (!CONNECTORS.includes(connector as (typeof CONNECTORS)[number])) {
        return { toolCallId: "", ok: false, error: "connector inválido", output: null };
      }
      const reason = String(args.reason ?? "");
      ctx.emit("ui_action", { action: "open_connector", connector, reason });
      return {
        toolCallId: "",
        ok: true,
        output: { opened: connector, reason, message: `Painel ${connector} aberto no editor.` },
      };
    },
  );

  reg.register(
    {
      name: "open_setup_step",
      description:
        "Guia o usuário: api (API Keys — chaves IA e E2B), models (preset/STT), connectors (OAuth deploy), auth.",
      parameters: {
        type: "object",
        properties: {
          step: { type: "string", enum: ["api", "api-keys", "models", "connectors", "auth"] },
          hash: {
            type: "string",
            description: "Âncora opcional, ex: forge-key-nvidia ou forge-ai-studio",
          },
          connector: {
            type: "string",
            enum: [...CONNECTORS],
            description: "Com step=connectors, qual integração abrir",
          },
        },
        required: ["step"],
      },
    },
    async (args): Promise<ToolResult> => {
      const step = String(args.step ?? "api");
      const hash = args.hash ? String(args.hash) : undefined;
      const connector = args.connector ? String(args.connector) : undefined;
      ctx.emit("ui_action", {
        action: "navigate_setup",
        step,
        hash,
        connector,
      });
      return {
        toolCallId: "",
        ok: true,
        output: { step, hash, message: "Navegação enviada ao editor." },
      };
    },
  );

  reg.register(
    {
      name: "record_lead_email",
      description:
        "Salva e-mail de contato do usuário (lead). Só use após consentimento explícito no chat. Nunca colete senha.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          consent: { type: "boolean", description: "Usuário concordou em receber contato" },
        },
        required: ["email", "consent"],
      },
    },
    async (args): Promise<ToolResult> => {
      const email = String(args.email ?? "")
        .trim()
        .toLowerCase();
      const consent = args.consent === true;
      if (!consent) {
        return { toolCallId: "", ok: false, error: "Sem consentimento", output: null };
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { toolCallId: "", ok: false, error: "E-mail inválido", output: null };
      }
      const { error } = await ctx.supabase
        .from("profiles")
        .update({ taste_lead_email: email, taste_lead_consent_at: new Date().toISOString() })
        .eq("id", ctx.userId);
      if (error) {
        return { toolCallId: "", ok: false, error: error.message, output: null };
      }
      ctx.emit("ui_action", { action: "lead_saved", email });
      return { toolCallId: "", ok: true, output: { saved: true, email } };
    },
  );
}
