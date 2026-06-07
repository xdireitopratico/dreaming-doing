// health — diagnóstico FORGE: DB, Auth, LLM providers, E2B
// Endpoint PÚBLICO (sem auth) para health checks externos (Vercel, Datadog, status pages).
// Retorna sempre 200 — o `ok` no body indica saúde; nunca falha o monitor externo com 5xx.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_REF") ?? "";
const PLATFORM_VERSION = Deno.env.get("FORGE_VERSION") ?? "dev";
const BUILD_SHA = Deno.env.get("FORGE_BUILD_SHA") ?? "local";

const TIMEOUT_MS = 5_000;

type CheckResult = {
  ok: boolean;
  latencyMs: number;
  detail?: string;
  error?: string;
};

type HealthReport = {
  ok: boolean;
  version: string;
  buildSha: string;
  projectRef: string;
  timestamp: string;
  checks: {
    db: CheckResult;
    auth: CheckResult;
    llm: {
      nvidia: CheckResult;
      groq: CheckResult;
    };
    e2b: CheckResult;
  };
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]);
}

async function withTimeoutOn<T>(thunk: () => PromiseLike<T>, ms: number, label: string): Promise<T> {
  return withTimeout(Promise.resolve(thunk()), ms, label);
}

async function checkDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await withTimeoutOn(
      () => supabase.from("profiles").select("id", { head: true, count: "exact" }).limit(0),
      TIMEOUT_MS,
      "db.select",
    );
    const latencyMs = Date.now() - start;
    if (error) return { ok: false, latencyMs, error: error.message };
    return { ok: true, latencyMs, detail: "profiles reachable" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

async function checkAuth(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: _data, error } = await withTimeout(
      supabase.auth.getUser(""),
      TIMEOUT_MS,
      "auth.getUser",
    );
    const latencyMs = Date.now() - start;
    if (error && !String(error.message).toLowerCase().includes("invalid token")) {
      return { ok: false, latencyMs, error: error.message };
    }
    return { ok: true, latencyMs, detail: "auth endpoint reachable" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

async function pingProvider(name: string, baseUrl: string, keyEnv: string): Promise<CheckResult> {
  const start = Date.now();
  const key = Deno.env.get(keyEnv);
  if (!key) {
    return { ok: false, latencyMs: 0, error: `${keyEnv} missing` };
  }
  try {
    const res = await withTimeout(
      fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      TIMEOUT_MS,
      `${name}.ping`,
    );
    const latencyMs = Date.now() - start;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, latencyMs, error: `${name} 401/403 — key inválida ou expirada` };
    }
    if (!res.ok) {
      return { ok: false, latencyMs, error: `${name} HTTP ${res.status}` };
    }
    return { ok: true, latencyMs, detail: `${name} reachable` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: `${name}: ${(e as Error).message}` };
  }
}

async function checkE2b(): Promise<CheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get("E2B_API_KEY");
  if (!apiKey) {
    return { ok: false, latencyMs: 0, error: "E2B_API_KEY missing" };
  }
  const base = Deno.env.get("E2B_API_BASE") || "https://api.e2b.app";
  try {
    const res = await withTimeout(
      fetch(`${base}/sandboxes`, {
        method: "GET",
        headers: { "X-API-KEY": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      TIMEOUT_MS,
      "e2b.list",
    );
    const latencyMs = Date.now() - start;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, latencyMs, error: `e2b 401/403 — key inválida` };
    }
    if (!res.ok) {
      return { ok: false, latencyMs, error: `e2b HTTP ${res.status}` };
    }
    return { ok: true, latencyMs, detail: "e2b API reachable" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: `e2b: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  const startedAt = Date.now();

  const [db, auth, nvidia, groq, e2b] = await Promise.all([
    checkDb(),
    checkAuth(),
    pingProvider("nvidia", "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
    pingProvider("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    checkE2b(),
  ]);

  const criticalOk = db.ok && auth.ok;
  const allChecks = { db, auth, llm: { nvidia, groq }, e2b };
  const llmAnyOk = nvidia.ok || groq.ok;
  const ok = criticalOk && llmAnyOk && e2b.ok;

  const report: HealthReport = {
    ok,
    version: PLATFORM_VERSION,
    buildSha: BUILD_SHA,
    projectRef: PROJECT_REF,
    timestamp: new Date().toISOString(),
    checks: allChecks,
  };

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: {
      ...FORGE_CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health-Duration-Ms": String(Date.now() - startedAt),
    },
  });
});
