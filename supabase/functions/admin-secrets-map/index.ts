/**
 * admin-secrets-map — Lists configured platform secrets for Prometheus admin mode.
 * FORGE: gated by isForgeAdminEmail; never returns secret values.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isForgeAdminEmail } from "../_shared/forge-admin.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Names referenced by Prometheus admin mode SECRET_TO_TOOL_MAP */
const PROMETHEUS_SECRET_NAMES = [
  "RESEND_API_KEY",
  "EVOLUTION_API_TOKEN",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_INSTANCE_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_NUMBER",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "NVIDIA_NEMOTRON3_SUPER_120B_API_KEY",
  "NVIDIA_NEMOTRON3_SUPER_30B_API_KEY",
  "NVIDIA_QWEN35_397B_A17B_API_KEY",
  "OPENROUTER_API_KEY",
  "ELEVENLABS_API_KEY",
  "FIRECRAWL_API_KEY",
  "PEXELS_API_KEY",
  "STRIPE_SECRET_KEY",
  "GOOGLE_CSE_API_KEY",
  "GOOGLE_CSE_CX_ID",
  "ESCAVADOR_API_KEY",
  "KLING_API_KEY",
  "RUNWAY_API_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "WHATSAPP_CLOUD_API_TOKEN",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isForgeAdminEmail(user.email)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action || "list_available";

    if (action !== "list_available") {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows } = await sbAdmin.from("platform_secrets").select("name").order("name");

    const fromDb = new Set((rows ?? []).map((r) => r.name));
    const available: string[] = [];

    for (const name of PROMETHEUS_SECRET_NAMES) {
      const envVal = Deno.env.get(name);
      if ((envVal && envVal.length > 0) || fromDb.has(name)) {
        available.push(name);
      }
    }

    return new Response(JSON.stringify({ secrets: available }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
