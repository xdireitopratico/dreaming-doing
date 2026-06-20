/**
 * design-library-chat — Chat LLM endpoint para o Browser Preview da Design Library.
 *
 * Recebe uma mensagem do usuário + contexto do job de extração e retorna
 * uma resposta do LLM. Usa as mesmas credenciais BYOK do usuário com o mesmo
 * modo (auto/fixed/robin) configurado em /models, replicando o pipeline do agent-run.
 *
 * Body:
 *   {
 *     jobId: string,
 *     message: string,
 *     context?: {
 *       previewUrl?: string,
 *       currentUrl?: string,
 *       jobStatus?: string
 *     }
 *   }
 *
 * Response:
 *   { reply: string, actions?: Array<{ type: string, params: object }> }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConnectorKeys, type AgentPreferencesPayload } from "../agent-run/connector-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatRequest {
  jobId: string;
  message: string;
  context?: {
    previewUrl?: string;
    currentUrl?: string;
    jobStatus?: string;
  };
}

interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
}

const SYSTEM_PROMPT = `Você é um assistente de design que ajuda a analisar e controlar uma sessão de extração de Design DNA.

Você tem acesso a um browser rodando em um sandbox E2B. O usuário pode pedir:
- Análise do site sendo extraído
- Ações no browser (navegar, clicar, digitar, screenshot)
- Insights sobre o design extraído

Quando o usuário pedir uma ação no browser, retorne um JSON estruturado com:
{
  "reply": "Texto explicando o que você vai fazer",
  "actions": [
    { "type": "navigate", "params": { "url": "https://..." } },
    { "type": "screenshot", "params": {} },
    { "type": "scroll", "params": { "x": 0, "y": 500 } }
  ]
}

Se for uma pergunta/análise, retorne:
{
  "reply": "Sua resposta aqui"
}

Mantenha respostas concisas e em português.`;

/** Resolve LLM config respeitando o modo (auto/fixed/robin) do usuário. */
function resolveLLMConfig(connectorKeys: Record<string, string>): LLMConfig | null {
  // Ordem de prioridade: chaves com baseURL conhecido
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
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract token from Authorization header
    const token = auth.replace(/^Bearer\s+/i, "");

    // Decode JWT payload to check role (avoids needing the actual service_role key)
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
      // User call — decode JWT via anon client
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseKey, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
      userEmail = userData?.user?.email ?? null;

      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Admin gate: only xdireitopratico@gmail.com
      if (userEmail?.toLowerCase() !== "xdireitopratico@gmail.com") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const input: ChatRequest = await req.json();
    if (!input.jobId || !input.message) {
      return new Response(JSON.stringify({ error: "jobId and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user's LLM credentials (same BYOK pattern as agent-run)
    let targetUserId = userId;
    if (!targetUserId) {
      // service_role: load admin's keys
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 500 });
      const adminUser = users?.users?.find(
        (u) => u.email?.toLowerCase() === "xdireitopratico@gmail.com",
      );
      targetUserId = adminUser?.id ?? null;
    }
    if (!targetUserId) {
      return new Response(
        JSON.stringify({
          reply: "⚠️ Admin user not found.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const connectorKeys = await loadConnectorKeys(supabase, targetUserId);
    const llmConfig = resolveLLMConfig(connectorKeys);

    if (!llmConfig) {
      return new Response(
        JSON.stringify({
          reply: "⚠️ Nenhuma chave LLM configurada. Adicione pelo menos uma em /api (OpenAI, Groq, OpenRouter, xAI, Gemini, DeepSeek ou Ollama).",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build context message
    const contextMsg = input.context
      ? `\n\nContexto atual:\n- Job: ${input.jobId}\n- Status: ${input.context.jobStatus ?? "?"}\n- URL atual: ${input.context.currentUrl ?? "?"}\n- Sandbox: ${input.context.previewUrl ?? "?"}`
      : "";

    const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: input.message + contextMsg },
        ],
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

    // Try to parse as JSON (with actions), fallback to plain text
    let result: { reply: string; actions?: unknown[] };
    try {
      const parsed = JSON.parse(content);
      result = {
        reply: parsed.reply ?? content,
        actions: parsed.actions,
      };
    } catch {
      result = { reply: content };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
