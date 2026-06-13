/**
 * Ollama Worker Client — Routes ALL Ollama inference through VPS Celery worker.
 * Eliminates Edge Function 60s timeout for Ollama calls.
 * 
 * Cloud models (Groq, GPT, Gemini) continue using direct Edge Function calls.
 * Only Ollama operations go through this worker path.
 */

const getVpsUrl = () => Deno.env.get("VPS_CELERY_URL") || "";
const getVpsToken = () => Deno.env.get("VPS_POST_PRODUCTION_TOKEN") || "";

function normalizeModel(modelId: string): string {
  if (modelId.startsWith("ollama/")) return modelId.slice(7);
  return modelId;
}

export interface OllamaChatOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  think?: boolean;
  session_id?: string;
  user_id?: string;
}

export interface OllamaChatResult {
  content: string;
  model: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_cents: number;
  finish_reason: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, any> }>;
}

async function vpsSubmit(payload: Record<string, any>): Promise<{ job_id: string }> {
  const url = getVpsUrl();
  const token = getVpsToken();
  if (!url || !token) throw new Error("VPS_CELERY_URL ou VPS_POST_PRODUCTION_TOKEN não configurados");

  const res = await fetch(`${url}/api/v1/jobs/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`VPS submit failed (${res.status}): ${err.substring(0, 300)}`);
  }
  return res.json();
}

export async function vpsJobStatus(jobId: string): Promise<any> {
  const url = getVpsUrl();
  const token = getVpsToken();

  const res = await fetch(`${url}/api/v1/jobs/${jobId}/status`, {
    headers: { "Authorization": `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    if (res.status === 404) return { status: "not_found" };
    throw new Error(`VPS status check failed (${res.status})`);
  }
  return res.json();
}

/**
 * Authority Gate — checks model against Motor de Potência via vps_ai_config.
 * FAIL-CLOSED: rejects any model not in INFRA_ALWAYS_ALLOWED or authorized slots.
 */
const INFRA_ALWAYS_ALLOWED = new Set(["nomic-embed-text-v2-moe", "minicpm-v"]);

async function checkAuthorityGate(modelName: string): Promise<void> {
  const bare = modelName.replace(":latest", "").trim();
  if (INFRA_ALWAYS_ALLOWED.has(bare)) return;

  // Query vps_ai_config for all active slots
  const sbUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VPS_SUPABASE_URL") || "";
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!sbUrl || !sbKey) {
    throw new Error("AUTHORITY_GATE_DENIED: Cannot verify model — no Supabase credentials");
  }

  try {
    const res = await fetch(`${sbUrl}/rest/v1/vps_ai_config?select=active_model`, {
      headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` },
    });
    if (res.ok) {
      const rows = await res.json();
      const authorized = new Set<string>();
      for (const row of rows) {
        if (row.active_model) {
          let m = row.active_model.replace(":latest", "").trim();
          if (m.startsWith("ollama/")) m = m.slice(7);
          authorized.add(m);
        }
      }
      if (authorized.has(bare)) return;
      throw new Error(
        `AUTHORITY_GATE_DENIED: modelo '${modelName}' não autorizado. ` +
        `Autorizados: ${[...INFRA_ALWAYS_ALLOWED, ...authorized].sort().join(", ")}`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("AUTHORITY_GATE_DENIED")) throw e;
    // Network error — fail closed
    throw new Error(`AUTHORITY_GATE_DENIED: Cannot verify model '${modelName}' — ${e}`);
  }
}

/**
 * Submit Ollama chat job and return job_id (async, no waiting).
 */
export async function ollamaChatAsync(options: OllamaChatOptions): Promise<{ job_id: string }> {
  const modelName = normalizeModel(options.model);

  // ═══ AUTHORITY GATE — FAIL-CLOSED ═══
  await checkAuthorityGate(modelName);

  const sessionId = options.session_id || `chat-${crypto.randomUUID().slice(0, 8)}`;

  return vpsSubmit({
    job_type: "ollama_inference",
    session_id: sessionId,
    user_id: options.user_id || "system",
    model_name: modelName,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens_llm: options.max_tokens ?? 1024,
    tools: options.tools || null,
    think: options.think ?? false,
  });
}

/**
 * Submit Ollama chat job and poll until done (sync, max 50s).
 * Use for non-streaming callers that need the result within Edge Function limits.
 */
export async function ollamaChat(options: OllamaChatOptions): Promise<OllamaChatResult> {
  const { job_id } = await ollamaChatAsync(options);

  const start = Date.now();
  let interval = 500;

  while (Date.now() - start < 50000) {
    await new Promise(r => setTimeout(r, interval));
    const status = await vpsJobStatus(job_id);

    if (status.status === "completed" && status.result) {
      return status.result as OllamaChatResult;
    }
    if (status.status === "failed") {
      throw new Error(status.error || "Ollama job failed");
    }

    interval = Math.min(interval * 1.3, 3000);
  }

  throw new Error(`OLLAMA_TIMEOUT: Job ${job_id} ainda processando após 50s`);
}

/**
 * Ollama generate (prompt → response text). Wraps as single-message chat.
 */
export async function ollamaGenerate(options: {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  think?: boolean;
}): Promise<string> {
  const result = await ollamaChat({
    model: options.model,
    messages: [{ role: "user", content: options.prompt }],
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    think: options.think,
  });
  return result.content;
}
