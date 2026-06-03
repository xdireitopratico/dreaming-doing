// create-project/index.ts — Edge Function: cria projeto + primeira conversa
// Retorna { projectId, conversationId } para o frontend iniciar o chat
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "projeto";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) {
      return json({ error: "Não autenticado" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const name = (body.name as string) || `Projeto ${new Date().toLocaleDateString("pt-BR")}`;
    const description = (body.description as string) || "";
    const firstPrompt = (body.firstPrompt as string) || "";

    let slug = slugify(name);

    // Garante slug único
    const { data: existing } = await supabase
      .from("projects")
      .select("slug")
      .eq("owner_id", userId)
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Cria projeto
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        owner_id: userId,
        name,
        slug,
        description,
        template: "vite-react",
      })
      .select("id, name, slug")
      .single();

    if (projErr || !project) {
      console.error("Erro ao criar projeto:", projErr);
      return json({ error: projErr?.message ?? "Erro ao criar projeto" }, 500);
    }

    // Cria primeira conversa
    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .insert({
        project_id: project.id,
        title: name,
      })
      .select("id")
      .single();

    if (convErr || !conversation) {
      console.error("Erro ao criar conversa:", convErr);
      return json({ error: convErr?.message ?? "Erro ao criar conversa" }, 500);
    }

    // Se veio primeiro prompt, insere mensagem inicial
    if (firstPrompt.trim()) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        parts: [{ type: "text", text: firstPrompt }],
      });
    }

    return json({
      ok: true,
      projectId: project.id,
      conversationId: conversation.id,
      name: project.name,
      slug: project.slug,
    });
  } catch (e: any) {
    console.error("[create-project]", e);
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
