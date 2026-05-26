// deno-lint-ignore-file no-explicit-any
// Edge function: roda o loop do agente — chama o Lovable AI Gateway com tool-calling,
// executa as tools (escreve/lê arquivos no project_files) e persiste mensagens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `Você é o agente do Lovable Clone. Gera apps web completos em HTML/CSS/JS vanilla (sem build step) chamando ferramentas para escrever arquivos.

Regras:
- O preview renderiza o arquivo "index.html" via srcdoc num iframe sandbox. Sempre garanta que existe um "index.html" autocontido (CSS inline em <style>, JS inline em <script>) — não há servidor de arquivos para CSS/JS externos no preview.
- Você pode criar outros arquivos para referência/organização, mas o app rodando deve estar inteiramente em index.html.
- Use design moderno, dark-mode amigável, tipografia limpa, espaçamento generoso. Nada de placeholders feios.
- Faça edits cirúrgicos: leia o arquivo antes de reescrever, use write_file para salvar a versão completa nova.
- Ao terminar, responda em 1-2 frases curtas o que foi feito.
- Sempre em português do Brasil.`;

const tools = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Cria ou sobrescreve um arquivo do projeto.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lê o conteúdo atual de um arquivo do projeto.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Lista todos os arquivos do projeto.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Apaga um arquivo do projeto.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { projectId, conversationId } = await req.json();
    if (!projectId || !conversationId) {
      return json({ error: "projectId e conversationId obrigatórios" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verifica posse pelo JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
    const userId = userData.user.id;

    const { data: project } = await admin.from("projects").select("id, owner_id").eq("id", projectId).single();
    if (!project || project.owner_id !== userId) return json({ error: "Projeto não encontrado" }, 404);

    // Carrega histórico
    const { data: history } = await admin
      .from("messages").select("role, parts, tool_calls").eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(40);

    const { data: filesNow } = await admin
      .from("project_files").select("path").eq("project_id", projectId);
    const manifest = (filesNow ?? []).map((f) => f.path).join("\n") || "(projeto vazio)";

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Manifesto atual de arquivos:\n${manifest}` },
      ...(history ?? []).map((m: any) => {
        if (m.role === "user") {
          const text = (m.parts ?? []).map((p: any) => p.text).filter(Boolean).join("\n");
          return { role: "user", content: text || "" };
        }
        if (m.role === "assistant") {
          const text = (m.parts ?? []).map((p: any) => p.text).filter(Boolean).join("\n");
          return { role: "assistant", content: text || "" };
        }
        return null;
      }).filter(Boolean),
    ];

    // Loop tool-calling (máx 12 passos)
    const toolCallsRecorded: any[] = [];
    let finalText = "";

    for (let step = 0; step < 12; step++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 429) return json({ error: "Limite de uso atingido. Tente novamente em instantes." }, 429);
        if (resp.status === 402) return json({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }, 402);
        return json({ error: `AI gateway ${resp.status}: ${errText.slice(0, 200)}` }, 500);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      // Sem tool calls -> resposta final
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalText = msg.content || "Pronto.";
        break;
      }

      // Empilha assistant message com tool_calls
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      // Executa tools
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* ignore */ }
        let result: any = { ok: true };

        if (name === "write_file") {
          const { error } = await admin.from("project_files").upsert(
            { project_id: projectId, path: args.path, content: args.content, updated_at: new Date().toISOString() },
            { onConflict: "project_id,path" },
          );
          result = error ? { ok: false, error: error.message } : { ok: true, wrote: args.path };
          toolCallsRecorded.push({ name, args: { path: args.path } });
        } else if (name === "read_file") {
          const { data } = await admin.from("project_files").select("content")
            .eq("project_id", projectId).eq("path", args.path).maybeSingle();
          result = data ? { content: data.content } : { error: "not_found" };
          toolCallsRecorded.push({ name, args: { path: args.path } });
        } else if (name === "list_files") {
          const { data } = await admin.from("project_files").select("path").eq("project_id", projectId);
          result = { files: (data ?? []).map((f) => f.path) };
          toolCallsRecorded.push({ name, args: {} });
        } else if (name === "delete_file") {
          await admin.from("project_files").delete().eq("project_id", projectId).eq("path", args.path);
          result = { ok: true };
          toolCallsRecorded.push({ name, args: { path: args.path } });
        } else {
          result = { error: `tool desconhecida: ${name}` };
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
    }

    // Persiste mensagem final do assistente
    await admin.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      parts: [{ type: "text", text: finalText || "Pronto." }],
      tool_calls: toolCallsRecorded,
    });

    await admin.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);

    return json({ ok: true, steps: toolCallsRecorded.length });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
