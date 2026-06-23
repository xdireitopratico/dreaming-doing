/**
 * design-library-chat — Chat LLM com contexto real + persistência de histórico.
 *
 * Replica o padrão do agent-run:
 *  - Identifica user via JWT (service_role bypass via claim decode)
 *  - Carrega BYOK do admin (mesma ordem de prioridade do agent-run)
 *  - Lê contexto real do job (status, URLs, errors, eventos recentes)
 *  - Persiste mensagens em design_library_chat_sessions/messages
 *  - Retorna ações para controlar o browser (browser-use style)
 *
 * Body:
 *   {
 *     jobId: string,
 *     message: string,  // "" para abrir sessão e receber welcome message
 *     actions?: Array<{type, params}>  // ações do LLM a executar no sandbox
 *   }
 *
 * Response:
 *   {
 *     reply: string,
 *     actions?: Array<{type: string, params: object}>,
 *     sessionId: string,
 *     messages: ChatMessage[]  // histórico completo da sessão
 *   }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConnectorKeys } from "../agent-run/connector-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatRequest {
  jobId: string;
  message: string;
}

interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
}

const SYSTEM_PROMPT = `Você é um assistente de design que ajuda a analisar e controlar uma sessão de extração de Design DNA.

Você fala SEMPRE em português do Brasil. Seja direto e útil. Se não souber algo, admita.

Quando o usuário pedir uma ação no browser, retorne JSON com:
{
  "reply": "O que você vai fazer",
  "actions": [
    { "type": "navigate", "params": { "url": "https://..." } },
    { "type": "screenshot", "params": {} },
    { "type": "scroll", "params": { "y": 500 } },
    { "type": "analyze", "params": { "selector": ".hero" } }
  ]
}

Para análise pura (sem ação), retorne:
{
  "reply": "Sua análise aqui"
}

NUNCA diga "extração concluída" sem explicar o que foi extraído. SEMPRE dê contexto sobre o que você vê.
Se o sandbox está fechado, avise o usuário e sugira criar um novo job.`;

function buildContextMessage(ctx: {
  jobStatus: string;
  urls: string[];
  previewUrl: string | null;
  ingestKind: string;
  errors: string[];
  recentEvents: { type: string; payload: Record<string, unknown> }[];
  libraryEntries: { name: string; source_url: string; quality_score: number }[];
}): string {
  const lines: string[] = [];
  lines.push(`## Contexto do job`);
  lines.push(`- Status: ${ctx.jobStatus}`);
  lines.push(`- Origem: ${ctx.ingestKind}`);
  lines.push(`- URLs: ${ctx.urls.join(", ") || "(nenhuma)"}`);
  lines.push(`- Sandbox: ${ctx.previewUrl ?? "FECHADO (job completed, sandbox encerrado pela E2B)"}`);
  if (ctx.errors.length > 0) {
    lines.push(`- Erros: ${ctx.errors.join("; ")}`);
  }
  if (ctx.libraryEntries.length > 0) {
    lines.push(`- Entradas na biblioteca deste job:`);
    for (const e of ctx.libraryEntries.slice(0, 5)) {
      lines.push(`  • ${e.name} (${e.source_url}) — qualidade ${e.quality_score}`);
    }
  }
  if (ctx.recentEvents.length > 0) {
    lines.push(`- Últimos eventos:`);
    for (const ev of ctx.recentEvents.slice(0, 5)) {
      const payloadStr = JSON.stringify(ev.payload).slice(0, 120);
      lines.push(`  • ${ev.type}: ${payloadStr}`);
    }
  }
  return lines.join("\n");
}

function resolveLLMConfig(connectorKeys: Record<string, string>): LLMConfig | null {
  if (connectorKeys.OPENROUTER_API_KEY) {
    return {
      apiKey: connectorKeys.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      label: "OpenRouter",
    };
  }
  if (connectorKeys.GROQ_API_KEY) {
    return {
      apiKey: connectorKeys.GROQ_API_KEY,
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.1-8b-instant",
      label: "Groq",
    };
  }
  if (connectorKeys.DEEPSEEK_API_KEY) {
    return {
      apiKey: connectorKeys.DEEPSEEK_API_KEY,
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      label: "DeepSeek",
    };
  }
  if (connectorKeys.XAI_API_KEY) {
    return {
      apiKey: connectorKeys.XAI_API_KEY,
      baseUrl: "https://api.x.ai/v1",
      model: "grok-2-latest",
      label: "xAI",
    };
  }
  if (connectorKeys.GEMINI_API_KEY) {
    return {
      apiKey: connectorKeys.GEMINI_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-1.5-flash",
      label: "Gemini",
    };
  }
  if (connectorKeys.OPENAI_API_KEY) {
    return {
      apiKey: connectorKeys.OPENAI_API_KEY,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      label: "OpenAI",
    };
  }
  if (connectorKeys.OLLAMA_BASE_URL) {
    return {
      apiKey: "ollama",
      baseUrl: connectorKeys.OLLAMA_BASE_URL,
      model: connectorKeys.OLLAMA_MODEL ?? "llama3.1",
      label: "Ollama",
    };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase: any = createClient(supabaseUrl, supabaseKey);

    const token = auth.replace(/^Bearer\s+/i, "");

    // JWT decode para service_role vs user
    let isServiceRole = false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      isServiceRole = payload.role === "service_role";
    } catch {
      /* not a JWT */
    }

    let userId: string | null = null;
    let userEmail: string | null = null;
    if (!isServiceRole) {
      const userClient: any = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseKey, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
      userEmail = userData?.user?.email ?? null;
      if (!userId || userEmail?.toLowerCase() !== "xdireitopratico@gmail.com") {
        return new Response(
          JSON.stringify({ error: userId ? "Forbidden" : "Unauthorized" }),
          {
            status: userId ? 403 : 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const input: ChatRequest = await req.json();
    if (!input.jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega contexto do job
    const { data: job } = await supabase
      .from("design_dna_jobs")
      .select("id, status, urls, error, results, meta, current_url_index")
      .eq("id", input.jobId)
      .single();

    if (!job) {
      return new Response(JSON.stringify({ error: "Job não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recentEvents } = await supabase
      .from("design_dna_events")
      .select("event_type, payload, created_at")
      .eq("job_id", input.jobId)
      .order("seq", { ascending: false })
      .limit(5);

    const jobMeta = (job.meta ?? {}) as { previewUrl?: string; ingestKind?: string };
    const ingestKind = jobMeta.ingestKind ?? "production";

    const { data: libraryEntries } = await supabase
      .from("design_system_library")
      .select("name, source_url, quality_score")
      .in("source_url", (job.urls as string[]) ?? [])
      .eq("ingest_kind", ingestKind)
      .limit(5);

    const ctx = {
      jobStatus: job.status,
      urls: (job.urls as string[]) ?? [],
      previewUrl: jobMeta.previewUrl ?? null,
      ingestKind,
      errors: ((job.results as unknown[]) ?? [])
        .filter((r) => r && typeof r === "object" && "error" in (r as Record<string, unknown>))
        .map((r) => (r as { error: string }).error)
        .slice(0, 3),
      recentEvents: (recentEvents ?? []).map((e: { event_type?: string; payload?: Record<string, unknown> }) => ({
        type: e.event_type as string,
        payload: (e.payload as Record<string, unknown>) ?? {},
      })),
      libraryEntries: (libraryEntries ?? []).map((e: { name?: string; source_url?: string; quality_score?: number }) => ({
        name: e.name as string,
        source_url: e.source_url as string,
        quality_score: e.quality_score as number,
      })),
    };

    // Garante sessão de chat (uma por job)
    let { data: session } = await supabase
      .from("design_library_chat_sessions")
      .select("id, title")
      .eq("job_id", input.jobId)
      .maybeSingle();

    if (!session) {
      const { data: newSession, error: sessErr } = await supabase
        .from("design_library_chat_sessions")
        .insert({
          job_id: input.jobId,
          user_id: userId,
          title: `Chat sobre ${ctx.urls[0] ?? "job " + input.jobId.slice(0, 8)}`,
        })
        .select("id, title")
        .single();
      if (sessErr) throw sessErr;
      session = newSession;
    }

    // Welcome message na primeira abertura
    if (!input.message || input.message.trim() === "") {
      let welcome: string;
      if (ctx.jobStatus === "running" || ctx.jobStatus === "pending") {
        welcome = `Recebi o job (${ctx.urls.join(", ")}). Vou acompanhar a extração e te aviso aqui conforme rolar. Pode mandar comandos durante o processo — analisar, tirar print, navegar, etc.`;
      } else if (ctx.jobStatus === "failed") {
        welcome = `Este job falhou${ctx.errors[0] ? `: ${ctx.errors[0]}` : "."}. Posso ajudar a investigar o erro, sugerir outra URL ou criar um novo job.`;
      } else if (ctx.jobStatus === "completed" && ctx.libraryEntries.length === 0) {
        welcome = `Job concluído, mas nenhuma entrada foi persistida na biblioteca. ${ctx.errors[0] ? `Erro: ${ctx.errors[0]}` : "Pode ter faltado o Playwright rodar. Quer que eu investigue?"}`;
      } else if (ctx.libraryEntries.length > 0) {
        welcome = `Job concluído. ${ctx.libraryEntries.length} entrada(s) na biblioteca${ctx.libraryEntries[0] ? ` — ${ctx.libraryEntries[0].name} (qualidade ${ctx.libraryEntries[0].quality_score})` : ""}. Posso analisar o Design DNA, refinar, ou comparar com outras entradas.`;
      } else {
        welcome = `Job ${ctx.jobStatus}. Me diga o que precisa.`;
      }

      // Persiste welcome
      await supabase.from("design_library_chat_messages").insert({
        session_id: session.id,
        role: "assistant",
        content: welcome,
        meta: { type: "welcome" },
      });

      return new Response(
        JSON.stringify({
          reply: welcome,
          sessionId: session.id,
          jobContext: ctx,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persiste mensagem do usuário
    const { error: userMsgErr } = await supabase.from("design_library_chat_messages").insert({
      session_id: session.id,
      role: "user",
      content: input.message,
    });
    if (userMsgErr) console.error("user msg persist err:", userMsgErr);

    // Carrega histórico para contexto
    const { data: history } = await supabase
      .from("design_library_chat_messages")
      .select("role, content, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Carrega BYOK do admin
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 500 });
      targetUserId =
        users?.users?.find((u: { email?: string; id?: string }) => u.email?.toLowerCase() === "xdireitopratico@gmail.com")?.id ?? null;
    }
    if (!targetUserId) {
      return new Response(
        JSON.stringify({ reply: "Admin user não encontrado.", sessionId: session.id, jobContext: ctx }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const connectorKeys = await loadConnectorKeys(supabase as any, targetUserId);
    const llmConfig = resolveLLMConfig(connectorKeys);

    if (!llmConfig) {
      const reply =
        "⚠️ Nenhuma chave LLM configurada. Adicione pelo menos uma em /api (OpenAI, Groq, OpenRouter, xAI, Gemini, DeepSeek ou Ollama).";
      await supabase.from("design_library_chat_messages").insert({
        session_id: session.id,
        role: "assistant",
        content: reply,
      });
      return new Response(
        JSON.stringify({ reply, sessionId: session.id, jobContext: ctx }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contextMsg = buildContextMessage(ctx);

    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextMsg },
    ];
    for (const h of history ?? []) {
      if (h.role === "user" || h.role === "assistant") {
        messages.push({ role: h.role, content: h.content as string });
      }
    }
    // Substitui a última user msg pela que veio no request (garante que está atualizada)
    if (messages[messages.length - 1]?.role !== "user") {
      messages.push({ role: "user", content: input.message });
    }

    const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error (${llmConfig.label}): ${response.status} — ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    let result: { reply: string; actions?: unknown[] };
    try {
      const parsed = JSON.parse(content);
      result = { reply: parsed.reply ?? content, actions: parsed.actions };
    } catch {
      result = { reply: content };
    }

    // Persiste resposta
    await supabase.from("design_library_chat_messages").insert({
      session_id: session.id,
      role: "assistant",
      content: result.reply,
      actions: result.actions ? (result.actions as unknown) : null,
    });

    return new Response(
      JSON.stringify({
        reply: result.reply,
        actions: result.actions,
        sessionId: session.id,
        jobContext: ctx,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[design-library-chat] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
