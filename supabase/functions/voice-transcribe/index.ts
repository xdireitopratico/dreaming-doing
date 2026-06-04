// voice-transcribe/index.ts — Groq Whisper Large v3 turbo.
// Recebe multipart/form-data com `file` (audio webm/m4a/mp3) e retorna { text }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GROQ_API_KEY) return json({ error: "GROQ_API_KEY ausente" }, 500);

    if (SUPABASE_URL && SERVICE_KEY) {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      if (!token) return json({ error: "Não autenticado" }, 401);
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: userData, error: uErr } = await supabase.auth.getUser(token);
      if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
    }

    const inForm = await req.formData();
    const file = inForm.get("file");
    if (!file || !(file instanceof File)) {
      return json({ error: "Campo 'file' obrigatório (audio)" }, 400);
    }

    const language = (inForm.get("language") as string | null) ?? "pt";

    const outForm = new FormData();
    outForm.append("file", file, file.name || "audio.webm");
    outForm.append("model", "whisper-large-v3-turbo");
    outForm.append("language", language);
    outForm.append("response_format", "json");
    outForm.append("temperature", "0");

    const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: outForm,
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return json({ error: `Groq ${resp.status}: ${txt.slice(0, 300)}` }, 502);
    }

    const data = await resp.json();
    return json({ text: (data.text ?? "").trim() });
  } catch (e: any) {
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
