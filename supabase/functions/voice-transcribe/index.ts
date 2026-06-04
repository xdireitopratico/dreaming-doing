// voice-transcribe/index.ts — Groq Whisper Large v3 turbo.
// Recebe multipart/form-data com `file` (audio webm/m4a/mp3) e retorna { text }.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GROQ_API_KEY) return json({ error: "GROQ_API_KEY ausente" }, 500);

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
