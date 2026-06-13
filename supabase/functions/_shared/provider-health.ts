/**
 * Provider Health Check — AetherForge Round 36
 * 
 * Checks connectivity and availability of each LLM provider.
 * Returns status: online | degraded | offline for each provider.
 * 
 * @version 1.0.0
 */

export interface ProviderHealthStatus {
  provider: string;
  status: "online" | "degraded" | "offline";
  latency_ms: number | null;
  error?: string;
  checked_at: string;
}

export interface HealthCheckResult {
  providers: ProviderHealthStatus[];
  checked_at: string;
  total_online: number;
  total_providers: number;
}

/**
 * Check health of all configured providers via lightweight requests.
 * For API providers, sends a minimal request or checks the endpoint.
 * For Ollama, pings the health endpoint.
 */
export async function checkAllProviders(): Promise<HealthCheckResult> {
  const checks: Promise<ProviderHealthStatus>[] = [
    checkOllama(),
    checkApiProvider("groq", "https://api.groq.com/openai/v1/models", "GROQ_API_KEY"),
    checkApiProvider("xai", "https://api.x.ai/v1/models", "XAI_API_KEY"),
    checkApiProvider("anthropic", "https://api.anthropic.com/v1/messages", "ANTHROPIC_API_KEY", {
      "x-api-key": "__KEY__",
      "anthropic-version": "2023-06-01",
    }),
    checkApiProvider("openai", "https://ai.gateway.lovable.dev/v1/models", "LOVABLE_API_KEY"),
    checkApiProvider("nvidia", "https://integrate.api.nvidia.com/v1/models", "NVIDIA_QWEN35_397B_A17B_API_KEY"),
    checkApiProvider("perplexity", "https://api.perplexity.ai/chat/completions", "PERPLEXITY_API_KEY"),
    // Lovable/Gemini uses same gateway as OpenAI
    checkLovableGemini(),
  ];

  const results = await Promise.allSettled(checks);
  const providers = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { provider: "unknown", status: "offline" as const, latency_ms: null, error: "Check failed", checked_at: new Date().toISOString() }
  );

  return {
    providers,
    checked_at: new Date().toISOString(),
    total_online: providers.filter((p) => p.status === "online").length,
    total_providers: providers.length,
  };
}

async function checkOllama(): Promise<ProviderHealthStatus> {
  const base = (Deno.env.get("OLLAMA_URL") || Deno.env.get("OLLAMA_BASE_URL") || "").replace(/\/$/, "");
  if (!base) {
    return {
      provider: "ollama",
      status: "offline",
      error: "OLLAMA_URL not configured",
      checked_at: new Date().toISOString(),
    };
  }
  const start = Date.now();
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      return { provider: "ollama", status: "online", latency_ms: latency, checked_at: new Date().toISOString() };
    }
    return { provider: "ollama", status: "degraded", latency_ms: latency, error: `HTTP ${res.status}`, checked_at: new Date().toISOString() };
  } catch (err: any) {
    return { provider: "ollama", status: "offline", latency_ms: Date.now() - start, error: err.message, checked_at: new Date().toISOString() };
  }
}

async function checkApiProvider(
  name: string,
  endpoint: string,
  secretEnv: string,
  customHeaders?: Record<string, string>,
): Promise<ProviderHealthStatus> {
  const apiKey = Deno.env.get(secretEnv);
  if (!apiKey) {
    return { provider: name, status: "offline", latency_ms: null, error: `${secretEnv} not configured`, checked_at: new Date().toISOString() };
  }

  const start = Date.now();
  try {
    const headers: Record<string, string> = {};
    if (customHeaders) {
      for (const [k, v] of Object.entries(customHeaders)) {
        headers[k] = v === "__KEY__" ? apiKey : v;
      }
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;

    if (res.ok || res.status === 405) {
      // 405 = endpoint exists but doesn't support GET (e.g. Anthropic, Perplexity) — still means it's reachable
      return { provider: name, status: "online", latency_ms: latency, checked_at: new Date().toISOString() };
    }
    if (res.status === 401 || res.status === 403) {
      return { provider: name, status: "degraded", latency_ms: latency, error: "Auth error — key may be invalid", checked_at: new Date().toISOString() };
    }
    if (res.status === 429) {
      return { provider: name, status: "degraded", latency_ms: latency, error: "Rate limited", checked_at: new Date().toISOString() };
    }
    return { provider: name, status: "degraded", latency_ms: latency, error: `HTTP ${res.status}`, checked_at: new Date().toISOString() };
  } catch (err: any) {
    return { provider: name, status: "offline", latency_ms: Date.now() - start, error: err.message, checked_at: new Date().toISOString() };
  }
}

async function checkLovableGemini(): Promise<ProviderHealthStatus> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return { provider: "lovable", status: "offline", latency_ms: null, error: "LOVABLE_API_KEY not configured", checked_at: new Date().toISOString() };
  }

  const start = Date.now();
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      return { provider: "lovable", status: "online", latency_ms: latency, checked_at: new Date().toISOString() };
    }
    return { provider: "lovable", status: "degraded", latency_ms: latency, error: `HTTP ${res.status}`, checked_at: new Date().toISOString() };
  } catch (err: any) {
    return { provider: "lovable", status: "offline", latency_ms: Date.now() - start, error: err.message, checked_at: new Date().toISOString() };
  }
}
