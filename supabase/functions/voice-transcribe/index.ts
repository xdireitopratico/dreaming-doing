// voice-transcribe — STT estrito: usa SOMENTE o provedor escolhido (sem fallback silencioso para Groq).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadConnectorKeys, loadConnectorPools } from "../agent-run/connector-keys.ts";
import { getPlatformSecret } from "../_shared/platform-secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resolve chave apenas para o provedor pedido — sem trocar para outro. */
async function resolveSttKeyStrict(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  prefer: "grok" | "groq",
): Promise<{ key: string; provider: "grok" | "groq" }> {
  const keys = await loadConnectorKeys(supabase, userId);

  if (prefer === "grok") {
    const globalXai = await getPlatformSecret(supabase, "XAI_API_KEY");
    if (keys.XAI_API_KEY) return { key: keys.XAI_API_KEY, provider: "grok" };
    if (globalXai) return { key: globalXai, provider: "grok" };
    throw new Error(
      "Você escolheu Grok STT, mas não há chave xAI. Em API Keys → xAI (Grok), cole sua chave e salve.",
    );
  }

  const groqPool = await loadConnectorPools(supabase, userId, "groq");
  const globalGroq = await getPlatformSecret(supabase, "GROQ_API_KEY");
  if (groqPool[0]) return { key: groqPool[0], provider: "groq" };
  if (keys.GROQ_API_KEY) return { key: keys.GROQ_API_KEY, provider: "groq" };
  if (globalGroq) return { key: globalGroq, provider: "groq" };
  throw new Error(
    "Você escolheu Groq Whisper, mas não há chave Groq. Em API Keys → Groq, cole sua chave e salve.",
  );
}

async function transcribeGrok(apiKey: string, file: File, language: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name || "audio.webm");
  if (language) form.append("language", language);

  const resp = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Grok STT falhou (${resp.status}): ${txt.slice(0, 280)}`);
  }

  const data = await resp.json();
  return String(data.text ?? "").trim();
}

async function transcribeGroq(apiKey: string, file: File, language: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name || "audio.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", language);
  form.append("response_format", "json");
  form.append("temperature", "0");

  const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Groq Whisper falhou (${resp.status}): ${txt.slice(0, 280)}`);
  }

  const data = await resp.json();
  return String(data.text ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Supabase não configurado na função" }, 500);
    }

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const inForm = await req.formData();
    const file = inForm.get("file");
    if (!file || !(file instanceof File)) {
      return json({ error: "Campo 'file' obrigatório (audio)" }, 400);
    }

    const language = (inForm.get("language") as string | null) ?? "pt";
    const preferRaw = (inForm.get("provider") as string | null) ?? "grok";
    const requested = preferRaw === "groq" ? "groq" : "grok";

    const resolved = await resolveSttKeyStrict(supabase, userData.user.id, requested);
    const text = resolved.provider === "grok"
      ? await transcribeGrok(resolved.key, file, language)
      : await transcribeGroq(resolved.key, file, language);

    return json({
      text,
      provider: resolved.provider,
      requested,
    });
  } catch (e: unknown) {
    return json({ error: (e as Error).message ?? "erro inesperado" }, 500);
  }
});