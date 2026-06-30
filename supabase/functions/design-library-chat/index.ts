/**
 * design-library-chat — Chat LLM com contexto real + persistência de histórico.
 *
 * Suporta dois modos de resposta:
 *   1. SSE Streaming (padrão): stream=true ou Accept: text/event-stream
 *      - Emite eventos: thinking, delta, actions, done, error
 *      - Permite "reality show" em tempo real no BrowserPreviewPanel
 *   2. JSON (fallback): stream=false ou sem Accept header
 *      - Retorna objeto JSON completo (compatível com versão anterior)
 *
 * BYOK: carrega chaves do próprio usuário autenticado (fallback: owner do job)
 * Auth: qualquer usuário autenticado pode usar (sem gate admin)
 *
 * Body:
 *   {
 *     jobId: string,
 *     message: string,  // "" para abrir sessão e receber welcome message
 *     stream?: boolean,  // true = SSE (padrão para mensagens não-vazias)
 *   }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConnectorKeys, loadConnectorPools } from "../agent-run/connector-keys.ts";
import { forgeOrigin } from "../_shared/cors.ts";
import {
  resolveAutoForComplexity,
  resolveModelFromPreferences,
  defaultRobinModel,
} from "../_shared/model-presets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function sseData(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface ChatRequest {
  jobId: string;
  message: string;
  stream?: boolean;
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
  lines.push(
    `- Sandbox: ${ctx.previewUrl ?? "FECHADO (job completed, sandbox encerrado pela E2B)"}`,
  );
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

/**
 * Resolve LLM config respeitando agent_preferences do usuário.
 * FAIL-CLOSED: sem preferência configurada = null.
 * NUNCA faz cascade heuristic entre providers.
 */
async function resolveLLMConfig(
  supabase: any,
  targetUserId: string,
  connectorKeys: Record<string, string>,
): Promise<LLMConfig | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("agent_preferences")
    .eq("id", targetUserId)
    .maybeSingle();
  const raw = profile?.agent_preferences;
  if (!raw || typeof raw !== "object") return null;
  const prefs = raw as Record<string, unknown>;

  const mode = prefs.mode === "rob" ? "robin" : prefs.mode;
  const userModelEntries = Array.isArray(prefs.userModelEntries)
    ? (prefs.userModelEntries as Array<{ slug: string; env: string; label?: string }>)
    : undefined;

  // FIXED mode → resolve from fixedPresetId or customModelId
  if (mode === "fixed") {
    const resolved = resolveModelFromPreferences(
      {
        fixedPresetId: typeof prefs.fixedPresetId === "string" ? prefs.fixedPresetId : undefined,
        customModelId: typeof prefs.customModelId === "string" ? prefs.customModelId : undefined,
        useCustomModel: prefs.useCustomModel === true,
        userModelEntries,
      },
      connectorKeys,
    );
    if (resolved) {
      return {
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl ?? "",
        model: resolved.model,
        label: `${resolved.label} (fixo)`,
      };
    }
    return null;
  }

  // ROBIN mode → pool provider
  if (mode === "robin") {
    const poolProvider = typeof prefs.poolProvider === "string" ? prefs.poolProvider : undefined;
    if (!poolProvider) return null;
    try {
      const poolKeys = await loadConnectorPools(supabase, targetUserId, poolProvider);
      if (poolKeys.length === 0) return null;
      const robinPresetId = typeof prefs.robinPoolModelId === "string" ? prefs.robinPoolModelId : undefined;
      const wire = defaultRobinModel(poolProvider, robinPresetId);
      const key = poolKeys[0]!;
      return {
        apiKey: key,
        baseUrl: wire.baseUrl ?? "",
        model: wire.model,
        label: `ROBIN · ${wire.label}`,
      };
    } catch {
      return null;
    }
  }

  // AUTO mode → autoAllowedPresetIds com routing por complexidade
  if (mode === "auto") {
    const allowlist = Array.isArray(prefs.autoAllowedPresetIds)
      ? (prefs.autoAllowedPresetIds as string[]).filter((id) => typeof id === "string" && id.trim().length > 0)
      : [];
    if (allowlist.length === 0) return null;
    const resolved = resolveAutoForComplexity(connectorKeys, 3, allowlist, userModelEntries);
    if (resolved) {
      return {
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl ?? "",
        model: resolved.model,
        label: `${resolved.label} (Auto)`,
      };
    }
    return null;
  }

  // Sem modo configurado → FAIL-CLOSED
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
    if (!isServiceRole) {
      const userClient: any = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseKey,
        {
          global: { headers: { Authorization: auth } },
        },
      );
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
    const { data: job, error: jobFetchErr } = await supabase
      .from("design_dna_jobs")
      .select("id, status, urls, error, results, meta, current_url_index, user_id")
      .eq("id", input.jobId)
      .single();

    if (jobFetchErr) {
      console.error("[design-library-chat] job fetch failed:", jobFetchErr.message);
      return new Response(JSON.stringify({ error: jobFetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!job) {
      return new Response(JSON.stringify({ error: "Job não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recentEvents, error: eventsErr } = await supabase
      .from("design_dna_events")
      .select("event_type, payload, created_at")
      .eq("job_id", input.jobId)
      .order("seq", { ascending: false })
      .limit(5);
    if (eventsErr) console.warn("[design-library-chat] events fetch failed:", eventsErr.message);

    const jobMeta = (job.meta ?? {}) as { previewUrl?: string; ingestKind?: string };
    const ingestKind = jobMeta.ingestKind ?? "production";

    const { data: libraryEntries, error: libErr } = await supabase
      .from("design_system_library")
      .select("name, source_url, quality_score")
      .in("source_url", (job.urls as string[]) ?? [])
      .eq("ingest_kind", ingestKind)
      .limit(5);
    if (libErr) console.warn("[design-library-chat] library entries fetch failed:", libErr.message);

    const ctx = {
      jobStatus: job.status,
      urls: (job.urls as string[]) ?? [],
      previewUrl: jobMeta.previewUrl ?? null,
      ingestKind,
      errors: ((job.results as unknown[]) ?? [])
        .filter((r) => r && typeof r === "object" && "error" in (r as Record<string, unknown>))
        .map((r) => (r as { error: string }).error)
        .slice(0, 3),
      recentEvents: (recentEvents ?? []).map(
        (e: { event_type?: string; payload?: Record<string, unknown> }) => ({
          type: e.event_type as string,
          payload: (e.payload as Record<string, unknown>) ?? {},
        }),
      ),
      libraryEntries: (libraryEntries ?? []).map(
        (e: { name?: string; source_url?: string; quality_score?: number }) => ({
          name: e.name as string,
          source_url: e.source_url as string,
          quality_score: e.quality_score as number,
        }),
      ),
    };

    // Garante sessão de chat (uma por job)
    const { data: existingSession, error: sessFetchErr } = await supabase
      .from("design_library_chat_sessions")
      .select("id, title")
      .eq("job_id", input.jobId)
      .maybeSingle();
    if (sessFetchErr)
      console.warn("[design-library-chat] session fetch failed:", sessFetchErr.message);
    let session = existingSession;

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
    const { data: history, error: histErr } = await supabase
      .from("design_library_chat_messages")
      .select("role, content, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .limit(20);
    if (histErr) console.warn("[design-library-chat] history fetch failed:", histErr.message);

    // Carrega BYOK do próprio usuário (ou do owner do job como fallback)
    let targetUserId = userId ?? (job.user_id as string | null);
    if (!targetUserId) {
      return new Response(
        JSON.stringify({
          reply: "⚠️ Usuário não identificado. Não foi possível carregar chaves de API.",
          sessionId: session.id,
          jobContext: ctx,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const connectorKeys = await loadConnectorKeys(supabase as any, targetUserId);
    const llmConfig = await resolveLLMConfig(supabase as any, targetUserId, connectorKeys);

    if (!llmConfig) {
      const reply =
        "⚠️ Nenhuma chave LLM configurada para o modelo selecionado. Configure seu modo (Auto, Fixo ou ROBIN) e as chaves correspondentes em /api-models.";
      await supabase.from("design_library_chat_messages").insert({
        session_id: session.id,
        role: "assistant",
        content: reply,
      });
      return new Response(JSON.stringify({ reply, sessionId: session.id, jobContext: ctx }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const wantsSSE = input.stream !== false &&
      (input.stream === true || req.headers.get("Accept")?.includes("text/event-stream"));

    // ── SSE Streaming ────────────────────────────────────────────────
    if (wantsSSE) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Emit thinking start
            controller.enqueue(encoder.encode(sseData("thinking", { started: true, model: llmConfig.model, label: llmConfig.label })));

            const llmResponse = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
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
                stream: true,
              }),
              signal: AbortSignal.timeout(60000),
            });

            if (!llmResponse.ok || !llmResponse.body) {
              const errText = await llmResponse.text().catch(() => "");
              controller.enqueue(encoder.encode(sseData("error", {
                message: `LLM API error (${llmConfig.label}): ${llmResponse.status} — ${errText.slice(0, 200)}`,
              })));
              controller.enqueue(encoder.encode(sseData("done", {})));
              controller.close();
              return;
            }

            controller.enqueue(encoder.encode(sseData("thinking", { stopped: true })));

            // Parse SSE stream from LLM
            const reader = llmResponse.body.getReader();
            let fullContent = "";
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += new TextDecoder().decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":")) continue;
                if (!trimmed.startsWith("data: ")) continue;
                const data = trimmed.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content ?? "";
                  if (delta) {
                    fullContent += delta;
                    controller.enqueue(encoder.encode(sseData("delta", { content: delta })));
                  }
                } catch {
                  // Skip malformed chunks
                }
              }
            }

            // Parse for actions
            let reply = fullContent;
            let actions: unknown[] | undefined;
            try {
              const parsed = JSON.parse(fullContent);
              reply = parsed.reply ?? fullContent;
              actions = parsed.actions;
            } catch {
              // Plain text reply
            }

            if (actions?.length) {
              controller.enqueue(encoder.encode(sseData("actions", { actions })));
            }

            // Persist full reply
            try {
              await supabase.from("design_library_chat_messages").insert({
                session_id: session.id,
                role: "assistant",
                content: reply,
                actions: actions ? (actions as unknown) : null,
              });
            } catch (persistErr) {
              console.warn("[design-library-chat] SSE reply persist failed:", (persistErr as Error).message);
            }

            controller.enqueue(encoder.encode(sseData("done", {
              reply,
              sessionId: session.id,
              jobContext: ctx,
            })));
          } catch (streamErr) {
            console.error("[design-library-chat] SSE stream error:", streamErr);
            try {
              controller.enqueue(encoder.encode(sseData("error", {
                message: (streamErr as Error).message,
              })));
              controller.enqueue(encoder.encode(sseData("done", {})));
            } catch {
              // Controller may already be closed
            }
          }
        },
      });

      return new Response(stream, { headers: sseHeaders });
    }

    // ── JSON Fallback (non-streaming) ──────────────────────────────
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
      throw new Error(
        `LLM API error (${llmConfig.label}): ${response.status} — ${errText.slice(0, 200)}`,
      );
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
    const { error: replyErr } = await supabase.from("design_library_chat_messages").insert({
      session_id: session.id,
      role: "assistant",
      content: result.reply,
      actions: result.actions ? (result.actions as unknown) : null,
    });
    if (replyErr) console.warn("[design-library-chat] reply persist failed:", replyErr.message);

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
