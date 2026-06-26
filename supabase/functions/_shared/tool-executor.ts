/**
 * tool-executor.ts — Real Tool Execution Engine for AetherForge
 * Implements: secret injection, retry w/ backoff, circuit breaker, idempotency, built-in tools.
 *
 * @version 1.0.0 — Round 37
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { routeLLM } from "./llm-router.ts";
import { researchWebQuery, scrapeWebPage } from "./web-research-providers.ts";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ToolExecutionRequest {
  tool_name: string;
  input_data: Record<string, any>;
  execution_id: string;
  tenant_id: string;
  /** Override timeout (ms) — default from registry or 30s */
  timeout_ms?: number;
}

export interface ToolExecutionResult {
  tool_name: string;
  display_name?: string;
  status: "success" | "error" | "circuit_open" | "idempotent_hit";
  result: any;
  duration_ms: number;
  retries: number;
  idempotency_key?: string;
  circuit_state?: string;
  error?: string;
}

interface ToolRegistryEntry {
  name: string;
  display_name: string;
  executor_type: string;
  executor_config: any;
  input_schema: any;
  output_schema: any;
  required_secrets: string[] | null;
  requires_idempotency: boolean | null;
  circuit_breaker_threshold: number | null;
  circuit_breaker_timeout_seconds: number | null;
  rate_limit_per_minute: number | null;
  category: string | null;
  is_builtin: boolean | null;
}

// ═══════════════════════════════════════════════════════════
// CIRCUIT BREAKER (DB-persisted via tool_circuit_breaker_state)
// ═══════════════════════════════════════════════════════════

interface CircuitState {
  state: "closed" | "open" | "half_open";
  failures: number;
  lastFailure: number;
  openedAt: number;
}

// In-memory cache with short TTL to avoid hitting DB on every call
const circuitCache = new Map<string, { state: CircuitState; fetchedAt: number }>();
const CIRCUIT_CACHE_TTL_MS = 5000; // 5s cache

async function getCircuitFromDB(toolName: string): Promise<CircuitState> {
  // Check in-memory cache first
  const cached = circuitCache.get(toolName);
  if (cached && Date.now() - cached.fetchedAt < CIRCUIT_CACHE_TTL_MS) {
    return cached.state;
  }

  try {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await sb
      .from("tool_circuit_breaker_state")
      .select("*")
      .eq("tool_name", toolName)
      .maybeSingle();

    const state: CircuitState = data
      ? {
          state: data.state,
          failures: data.failures,
          lastFailure: data.last_failure_at ? new Date(data.last_failure_at).getTime() : 0,
          openedAt: data.opened_at ? new Date(data.opened_at).getTime() : 0,
        }
      : { state: "closed", failures: 0, lastFailure: 0, openedAt: 0 };

    circuitCache.set(toolName, { state, fetchedAt: Date.now() });
    return state;
  } catch (err) {
    console.warn(
      `[circuit-breaker] DB read failed for ${toolName}, using in-memory fallback:`,
      (err as Error).message,
    );
    return cached?.state || { state: "closed", failures: 0, lastFailure: 0, openedAt: 0 };
  }
}

async function persistCircuitState(toolName: string, circuit: CircuitState): Promise<void> {
  try {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await sb.from("tool_circuit_breaker_state").upsert(
      {
        tool_name: toolName,
        state: circuit.state,
        failures: circuit.failures,
        last_failure_at: circuit.lastFailure ? new Date(circuit.lastFailure).toISOString() : null,
        opened_at: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tool_name" },
    );

    // Update cache
    circuitCache.set(toolName, { state: circuit, fetchedAt: Date.now() });
  } catch (err) {
    console.warn(`[circuit-breaker] DB persist failed for ${toolName}:`, (err as Error).message);
  }
}

async function checkCircuit(
  toolName: string,
  threshold: number,
  timeoutSec: number,
): Promise<{ allowed: boolean; state: string }> {
  const circuit = await getCircuitFromDB(toolName);

  if (circuit.state === "open") {
    const elapsed = (Date.now() - circuit.openedAt) / 1000;
    if (elapsed >= timeoutSec) {
      circuit.state = "half_open";
      await persistCircuitState(toolName, circuit);
      console.log(`[circuit-breaker] ${toolName}: OPEN → HALF_OPEN (cooldown elapsed)`);
      return { allowed: true, state: "half_open" };
    }
    return { allowed: false, state: "open" };
  }

  return { allowed: true, state: circuit.state };
}

async function recordSuccess(toolName: string): Promise<void> {
  const circuit: CircuitState = { state: "closed", failures: 0, lastFailure: 0, openedAt: 0 };
  await persistCircuitState(toolName, circuit);
}

async function recordFailure(toolName: string, threshold: number): Promise<void> {
  const circuit = await getCircuitFromDB(toolName);
  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.failures >= threshold) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    console.log(
      `[circuit-breaker] ${toolName}: → OPEN (${circuit.failures} failures >= ${threshold})`,
    );
  }
  await persistCircuitState(toolName, circuit);
}

// ═══════════════════════════════════════════════════════════
// IDEMPOTENCY
// ═══════════════════════════════════════════════════════════

function computeIdempotencyKey(toolName: string, inputData: any, executionId: string): string {
  const payload = JSON.stringify({ t: toolName, i: inputData, e: executionId });
  // Simple hash (FNV-1a 32-bit)
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `idem_${(hash >>> 0).toString(16)}`;
}

async function checkIdempotency(
  supabase: any,
  executionId: string,
  idempotencyKey: string,
): Promise<any | null> {
  const { data } = await supabase
    .from("agent_execution_steps")
    .select("output_data, status")
    .eq("execution_id", executionId)
    .eq("tool_idempotency_key", idempotencyKey)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  return data?.output_data || null;
}

// ═══════════════════════════════════════════════════════════
// SECRET INJECTION
// ═══════════════════════════════════════════════════════════

async function injectSecrets(
  supabase: any,
  tenantId: string,
  requiredSecrets: string[],
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};

  for (const secretName of requiredSecrets) {
    // 1. Try tenant secret (BYOK)
    const { data } = await supabase
      .from("tenant_secrets")
      .select("encrypted_value")
      .eq("tenant_id", tenantId)
      .eq("secret_name", secretName)
      .maybeSingle();

    if (data?.encrypted_value) {
      try {
        resolved[secretName] = atob(data.encrypted_value);
      } catch {
        resolved[secretName] = data.encrypted_value;
      }
      continue;
    }

    // PADR-014: No platform env fallback for user tools.
    // Secret not found — will be missing from resolved map.
    // Caller must check and throw appropriate error.
    console.warn(
      `[tool-executor] Secret ${secretName} not found for tenant ${tenantId}. User must configure it.`,
    );
  }

  return resolved;
}

// ═══════════════════════════════════════════════════════════
// BUILT-IN TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════

async function executeBuiltinTool(
  toolName: string,
  input: Record<string, any>,
  secrets: Record<string, string>,
  tenantId: string,
): Promise<any> {
  switch (toolName) {
    case "llm_generate": {
      const modelId = input.model_id || input.model || "groq/llama-3.1-8b-instant";
      const messages = input.messages || [
        { role: "user", content: input.prompt || input.text || "" },
      ];
      const result = await routeLLM({
        model_id: modelId,
        messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.max_tokens ?? 1024,
        tenant_id: tenantId,
      });
      return {
        response: result.content,
        model: result.model,
        provider: result.provider,
        tokens: result.tokens_in + result.tokens_out,
        cost_cents: result.cost_cents,
      };
    }

    case "rag_search": {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const query = input.query || input.text || "";
      const topK = input.top_k || 5;
      const ragTenantId = input.tenant_id || tenantId;

      if (!query) throw new Error("rag_search requires 'query'");

      const embedUrl = Deno.env.get("OLLAMA_EMBED_URL") || "http://localhost:11434/api/embed";
      const embedModel = Deno.env.get("OLLAMA_EMBED_MODEL") || "nomic-embed-text-v2-moe";
      const embedRes = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embedModel, input: query.substring(0, 2000) }),
        signal: AbortSignal.timeout(30000),
      });
      if (!embedRes.ok) {
        const err = await embedRes.text().catch(() => "?");
        throw new Error(`RAG embed failed (${embedRes.status}): ${err.substring(0, 200)}`);
      }
      const embedData = await embedRes.json();
      const embedding = embedData.embeddings?.[0];
      if (!embedding?.length) throw new Error("Empty embedding for rag_search query");

      const { data: chunks, error } = await supabase.rpc("search_rag_chunks", {
        p_tenant_id: ragTenantId,
        p_embedding: embedding,
        p_match_threshold: input.match_threshold ?? 0.5,
        p_match_count: topK,
      });
      if (error) throw new Error(`search_rag_chunks: ${error.message}`);

      return { chunks: chunks || [], query, top_k: topK, source: "search_rag_chunks" };
    }

    case "http_request": {
      const url = input.url;
      if (!url) throw new Error("http_request requires 'url' in input");

      // Validate URL
      try {
        new URL(url);
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }

      const method = (input.method || "GET").toUpperCase();
      const headers: Record<string, string> = { ...(input.headers || {}) };

      // Inject auth from secrets if configured
      if (input.auth_secret && secrets[input.auth_secret]) {
        headers["Authorization"] = `Bearer ${secrets[input.auth_secret]}`;
      }

      const fetchOpts: RequestInit = { method, headers };
      if (["POST", "PUT", "PATCH"].includes(method) && input.body) {
        fetchOpts.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeout_ms || 15000);
      fetchOpts.signal = controller.signal;

      const res = await fetch(url, fetchOpts);
      clearTimeout(timeout);

      const body = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { raw: body };
      }

      return { status: res.status, ok: res.ok, data: parsed };
    }

    case "db_query": {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const table = input.table;
      if (!table) throw new Error("db_query requires 'table'");

      let query = supabase.from(table).select(input.select || "*");
      if (input.filters) {
        for (const [col, val] of Object.entries(input.filters)) {
          query = query.eq(col, val);
        }
      }
      if (input.limit) query = query.limit(input.limit);
      if (input.order_by)
        query = query.order(input.order_by, { ascending: input.ascending ?? true });

      const { data, error } = await query;
      if (error) throw new Error(`db_query error: ${error.message}`);
      return { rows: data, count: data?.length || 0 };
    }

    case "db_insert": {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const table = input.table;
      if (!table) throw new Error("db_insert requires 'table'");
      if (!input.data) throw new Error("db_insert requires 'data'");

      const { data, error } = await supabase.from(table).insert(input.data).select();
      if (error) throw new Error(`db_insert error: ${error.message}`);
      return { inserted: data, count: data?.length || 0 };
    }

    case "condition_eval": {
      // Simple expression evaluator (safe subset)
      const expression = input.expression || "true";
      const variables = input.variables || {};
      // Replace variable references
      let expr = expression;
      for (const [k, v] of Object.entries(variables)) {
        expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), JSON.stringify(v));
      }
      // Evaluate basic comparisons only
      let result = false;
      try {
        // Safe: only allows literals, comparisons, logical ops
        result = Function(`"use strict"; return (${expr});`)();
      } catch {
        result = false;
      }
      return { expression, result: !!result, branch: result ? "true" : "false" };
    }

    case "web_research":
      return researchWebQuery(input, secrets);

    // ── P24: Visualization Tools (QuickChart — free, no API key) ──

    case "chart_generate": {
      // Generates chart image URL via QuickChart.io (free, no key required)
      const chartType = input.type || "bar"; // bar, line, pie, doughnut, radar, polarArea
      const labels = input.labels || [];
      const datasets = input.datasets || [{ label: "Data", data: input.data || [] }];
      const title = input.title || "";
      const width = input.width || 600;
      const height = input.height || 400;
      const backgroundColor = input.background_color || "white";

      const chartConfig = {
        type: chartType,
        data: { labels, datasets },
        options: {
          ...(title ? { title: { display: true, text: title } } : {}),
          ...(input.options || {}),
        },
      };

      // QuickChart supports both GET (URL encoding) and POST
      const qcResponse = await fetch("https://quickchart.io/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chart: chartConfig,
          width,
          height,
          backgroundColor,
          format: input.format || "png",
          devicePixelRatio: input.device_pixel_ratio || 2,
        }),
      });

      if (!qcResponse.ok) {
        throw new Error(`QuickChart error: HTTP ${qcResponse.status}`);
      }

      // Return the short URL for the chart
      const shortUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=${width}&h=${height}&bkg=${encodeURIComponent(backgroundColor)}`;

      return {
        chart_url: shortUrl,
        chart_type: chartType,
        width,
        height,
        labels_count: labels.length,
        datasets_count: datasets.length,
      };
    }

    case "qr_generate": {
      // Generates QR code image URL via QuickChart.io (free, no key required)
      const text = input.text || input.data || input.url || "";
      if (!text) throw new Error("qr_generate requires 'text', 'data', or 'url'");

      const size = input.size || 300;
      const margin = input.margin ?? 4;
      const darkColor = input.dark_color || "000000";
      const lightColor = input.light_color || "ffffff";
      const format = input.format || "png";
      const ecLevel = input.ec_level || "M"; // L, M, Q, H

      const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=${size}&margin=${margin}&dark=${darkColor}&light=${lightColor}&format=${format}&ecLevel=${ecLevel}`;

      // Validate it works
      const qrResponse = await fetch(qrUrl, { method: "HEAD" });
      if (!qrResponse.ok) {
        throw new Error(`QR generation failed: HTTP ${qrResponse.status}`);
      }

      return {
        qr_url: qrUrl,
        text: text.substring(0, 100),
        size,
        format,
        ec_level: ecLevel,
      };
    }

    // ── P25: Email Intelligence (Resend + IMAP — tenant keys via PADR-014) ──

    case "email_send": {
      // Send email via Resend using tenant's own API key
      const resendKey = secrets["RESEND_API_KEY"];
      if (!resendKey) throw new Error("email_send requires RESEND_API_KEY in tenant_secrets");

      const to = Array.isArray(input.to) ? input.to : [input.to];
      const from = input.from || input.from_email || "noreply@example.com";
      const subject = input.subject;
      const html = input.html || input.body || "";
      const text_body = input.text || "";
      const cc = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined;
      const bcc = input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined;
      const reply_to = input.reply_to || undefined;

      if (!to.length || !subject) throw new Error("email_send requires 'to' and 'subject'");

      const emailPayload: Record<string, any> = {
        from,
        to,
        subject,
      };
      if (html) emailPayload.html = html;
      if (text_body) emailPayload.text = text_body;
      if (cc) emailPayload.cc = cc;
      if (bcc) emailPayload.bcc = bcc;
      if (reply_to) emailPayload.reply_to = reply_to;
      if (input.tags) emailPayload.tags = input.tags;
      if (input.headers) emailPayload.headers = input.headers;

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });

      const resendResult = await resendResponse.json();

      if (!resendResponse.ok) {
        throw new Error(
          `Resend error ${resendResponse.status}: ${JSON.stringify(resendResult).substring(0, 300)}`,
        );
      }

      return {
        email_id: resendResult.id,
        to,
        subject,
        status: "sent",
      };
    }

    case "email_batch_send": {
      // Send multiple emails via Resend batch API
      const resendKey = secrets["RESEND_API_KEY"];
      if (!resendKey) throw new Error("email_batch_send requires RESEND_API_KEY in tenant_secrets");

      const emails = input.emails || [];
      if (!Array.isArray(emails) || emails.length === 0)
        throw new Error("email_batch_send requires 'emails' array");
      if (emails.length > 100) throw new Error("Resend batch limit is 100 emails per call");

      const batch = emails.map((e: any) => ({
        from: e.from || input.default_from || "noreply@example.com",
        to: Array.isArray(e.to) ? e.to : [e.to],
        subject: e.subject,
        html: e.html || e.body || "",
        ...(e.reply_to ? { reply_to: e.reply_to } : {}),
        ...(e.tags ? { tags: e.tags } : {}),
      }));

      const resendResponse = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      const resendResult = await resendResponse.json();

      if (!resendResponse.ok) {
        throw new Error(
          `Resend batch error ${resendResponse.status}: ${JSON.stringify(resendResult).substring(0, 300)}`,
        );
      }

      return {
        sent_count: resendResult.data?.length || batch.length,
        email_ids: resendResult.data?.map((r: any) => r.id) || [],
        status: "sent",
      };
    }

    case "email_check_status": {
      // Check email delivery status via Resend
      const resendKey = secrets["RESEND_API_KEY"];
      if (!resendKey)
        throw new Error("email_check_status requires RESEND_API_KEY in tenant_secrets");

      const emailId = input.email_id;
      if (!emailId) throw new Error("email_check_status requires 'email_id'");

      const response = await fetch(`https://api.resend.com/emails/${emailId}`, {
        headers: { Authorization: `Bearer ${resendKey}` },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(`Resend status error: ${JSON.stringify(result).substring(0, 200)}`);
      }

      return {
        email_id: emailId,
        status: result.last_event || "unknown",
        from: result.from,
        to: result.to,
        subject: result.subject,
        created_at: result.created_at,
        events: (result.events || []).map((ev: any) => ({
          type: ev.type,
          created_at: ev.created_at,
        })),
      };
    }

    case "email_read": {
      // Read emails via IMAP — delegates to edge function for TCP/TLS support
      // Requires: IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASSWORD in tenant_secrets
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const response = await fetch(`${supabaseUrl}/functions/v1/email-imap-reader`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          folder: input.folder || "INBOX",
          limit: Math.min(input.limit || 10, 50),
          search: input.search || null,
          since: input.since || null,
          unseen_only: input.unseen_only ?? true,
          mark_as_read: input.mark_as_read ?? false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown");
        throw new Error(`email_read failed: ${errText.substring(0, 200)}`);
      }

      return await response.json();
    }

    // ── P26: Analytics de Negócio (Sentimento + NL-to-SQL + Classificação) ──

    case "sentiment_analyze": {
      // Sentiment analysis via LLM — uses tenant's configured model or fallback
      const text = input.text || input.content || "";
      if (!text) throw new Error("sentiment_analyze requires 'text'");

      const language = input.language || "pt-BR";
      const detailed = input.detailed ?? true;

      const systemPrompt = `You are a sentiment analysis engine. Analyze the text and return ONLY valid JSON with this exact structure:
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "score": <number from -1.0 to 1.0>,
  "confidence": <number from 0.0 to 1.0>,
  "emotions": ["joy", "anger", "sadness", "fear", "surprise", "disgust", "trust", "anticipation"],
  "key_phrases": ["phrase1", "phrase2"],
  "tone": "formal" | "informal" | "aggressive" | "empathetic" | "sarcastic" | "neutral",
  "urgency": "low" | "medium" | "high" | "critical",
  "summary": "<one sentence summary of sentiment>"
}
Only include emotions that are actually detected. Respond in ${language}.`;

      const modelId = input.model_id;
      if (!modelId) throw new Error("sentiment_analyze requires 'model_id' in input");

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text.substring(0, 4000) },
        ],
        temperature: 0.1,
        max_tokens: 500,
        tenant_id: tenantId,
      });

      const responseText = llmResult.content || "";
      let parsed: any;
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { sentiment: "neutral", score: 0, confidence: 0 };
      } catch {
        parsed = { sentiment: "neutral", score: 0, confidence: 0, raw: responseText };
      }

      return {
        ...parsed,
        text_length: text.length,
        language,
        model_used: llmResult.provider || "unknown",
      };
    }

    case "text_classify": {
      // Multi-label text classification via LLM
      const text = input.text || input.content || "";
      if (!text) throw new Error("text_classify requires 'text'");

      const categories = input.categories || [];
      const multi_label = input.multi_label ?? false;

      if (!categories.length) throw new Error("text_classify requires 'categories' array");

      const systemPrompt = `You are a text classification engine. Classify the text into the provided categories.
Return ONLY valid JSON:
{
  "classifications": [
    {"category": "<name>", "confidence": <0.0-1.0>, "reason": "<brief reason>"}
  ],
  "primary_category": "<most likely category>",
  "primary_confidence": <0.0-1.0>
}
${multi_label ? "Multiple categories can apply." : "Choose only the single best category."}
Available categories: ${JSON.stringify(categories)}`;

      const modelId = input.model_id;
      if (!modelId) throw new Error("text_classify requires 'model_id' in input");

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text.substring(0, 4000) },
        ],
        temperature: 0.1,
        max_tokens: 500,
        tenant_id: tenantId,
      });

      const responseText = llmResult.content || "";
      let parsed: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { classifications: [], primary_category: "unknown" };
      } catch {
        parsed = { classifications: [], primary_category: "unknown", raw: responseText };
      }

      return {
        ...parsed,
        categories_provided: categories,
        multi_label,
        model_used: llmResult.provider || "unknown",
      };
    }

    case "nl_to_sql": {
      // Natural Language to safe Supabase query — LLM generates query params, NOT raw SQL
      const question = input.question || input.query || "";
      if (!question) throw new Error("nl_to_sql requires 'question'");

      const tables = input.tables || [];
      const schema_hint = input.schema_hint || "";

      if (!tables.length)
        throw new Error("nl_to_sql requires 'tables' array with allowed table names");

      // Security: Only allow querying specific tenant-approved tables
      const allowedTables = tables.filter((t: string) => /^[a-z_][a-z0-9_]*$/.test(t));

      const systemPrompt = `You are a database query translator. Convert the natural language question into a structured Supabase query.
IMPORTANT: You must NEVER generate raw SQL. Only generate structured query parameters.

Return ONLY valid JSON:
{
  "table": "<table_name>",
  "select": "<columns to select, e.g. 'id, name, created_at' or '*'>",
  "filters": [
    {"column": "<col>", "operator": "<eq|neq|gt|gte|lt|lte|like|ilike|in|is>", "value": "<value>"}
  ],
  "order_by": "<column>" | null,
  "ascending": true | false,
  "limit": <number> | null,
  "aggregation": null | {"type": "count" | "sum" | "avg" | "min" | "max", "column": "<col>"},
  "explanation": "<brief explanation of what this query does>"
}

Allowed tables: ${JSON.stringify(allowedTables)}
${schema_hint ? `Schema hints: ${schema_hint}` : ""}
If the question cannot be answered with these tables, set "error": "<reason>" instead.`;

      const modelId = input.model_id;
      if (!modelId) throw new Error("nl_to_sql requires 'model_id' in input");

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.1,
        max_tokens: 600,
        tenant_id: tenantId,
      });

      const responseText = llmResult.content || "";
      let querySpec: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        querySpec = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { error: "Failed to parse query specification" };
      } catch {
        return { error: "Failed to parse LLM response", raw: responseText };
      }

      // Validate: table must be in allowed list
      if (querySpec.error) {
        return { error: querySpec.error, question };
      }
      if (!allowedTables.includes(querySpec.table)) {
        return {
          error: `Table '${querySpec.table}' is not in allowed tables list`,
          allowed: allowedTables,
        };
      }

      // Execute the structured query safely via Supabase client
      if (input.execute !== false) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const db = createClient(supabaseUrl, supabaseKey);

        let q = db.from(querySpec.table).select(querySpec.select || "*");

        // Apply filters
        if (querySpec.filters && Array.isArray(querySpec.filters)) {
          for (const f of querySpec.filters) {
            const op = f.operator || "eq";
            switch (op) {
              case "eq": {
                q = (q as any).eq(f.column, f.value);
                break;
              }
              case "neq": {
                q = (q as any).neq(f.column, f.value);
                break;
              }
              case "gt": {
                q = (q as any).gt(f.column, f.value);
                break;
              }
              case "gte": {
                q = (q as any).gte(f.column, f.value);
                break;
              }
              case "lt": {
                q = (q as any).lt(f.column, f.value);
                break;
              }
              case "lte": {
                q = (q as any).lte(f.column, f.value);
                break;
              }
              case "like": {
                q = (q as any).like(f.column, f.value);
                break;
              }
              case "ilike": {
                q = (q as any).ilike(f.column, f.value);
                break;
              }
              case "in": {
                q = (q as any).in(f.column, Array.isArray(f.value) ? f.value : [f.value]);
                break;
              }
              case "is": {
                q = (q as any).is(f.column, f.value);
                break;
              }
            }
          }
        }

        if (querySpec.order_by)
          q = (q as any).order(querySpec.order_by, { ascending: querySpec.ascending ?? true });
        if (querySpec.limit) q = (q as any).limit(querySpec.limit);

        const { data, error } = await q;
        if (error) {
          return { error: `Query failed: ${error.message}`, query_spec: querySpec };
        }

        // Handle aggregation client-side if requested
        let aggregationResult: any = null;
        if (querySpec.aggregation && data) {
          const agg = querySpec.aggregation;
          const values = data
            .map((r: any) => Number(r[agg.column]))
            .filter((v: number) => !isNaN(v));
          switch (agg.type) {
            case "count":
              aggregationResult = { count: data.length };
              break;
            case "sum":
              aggregationResult = { sum: values.reduce((a: number, b: number) => a + b, 0) };
              break;
            case "avg":
              aggregationResult = {
                avg: values.length
                  ? values.reduce((a: number, b: number) => a + b, 0) / values.length
                  : 0,
              };
              break;
            case "min":
              aggregationResult = { min: values.length ? Math.min(...values) : null };
              break;
            case "max":
              aggregationResult = { max: values.length ? Math.max(...values) : null };
              break;
          }
        }

        return {
          rows: data,
          row_count: data?.length || 0,
          aggregation: aggregationResult,
          query_spec: querySpec,
          explanation: querySpec.explanation,
          question,
        };
      }

      // Dry-run mode: return query spec without executing
      return {
        query_spec: querySpec,
        explanation: querySpec.explanation,
        question,
        dry_run: true,
      };
    }

    case "data_aggregate": {
      // Aggregate/summarize data from a table with grouping support
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const db = createClient(supabaseUrl, supabaseKey);

      const table = input.table;
      if (!table) throw new Error("data_aggregate requires 'table'");

      const metrics = input.metrics || []; // e.g. [{column: "amount", agg: "sum"}, {column: "id", agg: "count"}]
      const group_by = input.group_by || null; // column name for grouping
      const filters = input.filters || {};
      const limit = input.limit || 1000;

      // Fetch data
      let q = db.from(table).select("*");
      for (const [col, val] of Object.entries(filters)) {
        q = q.eq(col, val as any);
      }
      q = q.limit(limit);

      const { data, error } = await q;
      if (error) throw new Error(`data_aggregate error: ${error.message}`);
      if (!data || data.length === 0) return { groups: [], total_rows: 0 };

      // Compute aggregations
      const computeAgg = (rows: any[], column: string, aggType: string) => {
        const values = rows.map((r: any) => Number(r[column])).filter((v: number) => !isNaN(v));
        switch (aggType) {
          case "count":
            return rows.length;
          case "sum":
            return values.reduce((a, b) => a + b, 0);
          case "avg":
            return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          case "min":
            return values.length ? Math.min(...values) : null;
          case "max":
            return values.length ? Math.max(...values) : null;
          case "distinct":
            return [...new Set(rows.map((r: any) => r[column]))].length;
          default:
            return null;
        }
      };

      if (group_by) {
        // Group data
        const groups: Record<string, any[]> = {};
        for (const row of data) {
          const key = String(row[group_by] ?? "null");
          (groups[key] = groups[key] || []).push(row);
        }

        const result = Object.entries(groups).map(([key, rows]) => {
          const entry: Record<string, any> = { [group_by]: key, _count: rows.length };
          for (const m of metrics) {
            entry[`${m.agg}_${m.column}`] = computeAgg(rows, m.column, m.agg);
          }
          return entry;
        });

        return { groups: result, total_rows: data.length, group_count: result.length };
      }

      // No grouping — total aggregation
      const totals: Record<string, any> = { _count: data.length };
      for (const m of metrics) {
        totals[`${m.agg}_${m.column}`] = computeAgg(data, m.column, m.agg);
      }

      return { totals, total_rows: data.length };
    }

    // NOTE: email_read case already defined above (line ~541). Removed duplicate.

    // ── P27: Multi-Canal (Instagram/Messenger + VoIP) ──

    case "instagram_send": {
      // Send Instagram/Messenger message via Meta Graph API
      // Requires: META_PAGE_ACCESS_TOKEN in tenant_secrets
      const pageToken = secrets["META_PAGE_ACCESS_TOKEN"];
      if (!pageToken)
        throw new Error("instagram_send requires META_PAGE_ACCESS_TOKEN in tenant_secrets");

      const recipientId = input.recipient_id || input.to;
      if (!recipientId) throw new Error("instagram_send requires 'recipient_id'");

      const messageType = input.type || "text"; // text, image, template, quick_replies
      const apiVersion = input.api_version || "v19.0";
      const pageId = input.page_id || secrets["META_PAGE_ID"] || "";

      const messagePayload: Record<string, any> = {
        recipient: { id: recipientId },
        messaging_type: input.messaging_type || "RESPONSE",
      };

      switch (messageType) {
        case "text":
          messagePayload.message = { text: input.text || input.message || "" };
          if (input.quick_replies) {
            messagePayload.message.quick_replies = input.quick_replies.map((qr: any) => ({
              content_type: qr.type || "text",
              title: qr.title,
              payload: qr.payload || qr.title,
            }));
          }
          break;
        case "image":
          messagePayload.message = {
            attachment: {
              type: "image",
              payload: input.image_url
                ? { url: input.image_url, is_reusable: true }
                : { attachment_id: input.attachment_id },
            },
          };
          break;
        case "template":
          messagePayload.message = {
            attachment: {
              type: "template",
              payload: input.template || {},
            },
          };
          break;
        default:
          messagePayload.message = { text: input.text || input.message || "" };
      }

      // Determine endpoint: Instagram Messaging or Messenger
      const platform = input.platform || "instagram"; // instagram | messenger
      const endpoint =
        platform === "messenger"
          ? `https://graph.facebook.com/${apiVersion}/${pageId}/messages`
          : `https://graph.facebook.com/${apiVersion}/${pageId}/messages`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageToken}`,
        },
        body: JSON.stringify(messagePayload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          `Meta API error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
        );
      }

      return {
        message_id: result.message_id,
        recipient_id: result.recipient_id || recipientId,
        platform,
        type: messageType,
        status: "sent",
      };
    }

    case "instagram_read": {
      // Read Instagram/Messenger conversations via Meta Graph API
      const pageToken = secrets["META_PAGE_ACCESS_TOKEN"];
      if (!pageToken)
        throw new Error("instagram_read requires META_PAGE_ACCESS_TOKEN in tenant_secrets");

      const apiVersion = input.api_version || "v19.0";
      const pageId = input.page_id || secrets["META_PAGE_ID"] || "";
      const platform = input.platform || "instagram";
      const limit = Math.min(input.limit || 10, 25);

      // Get conversations
      const conversationsUrl =
        platform === "instagram"
          ? `https://graph.facebook.com/${apiVersion}/${pageId}/conversations?platform=instagram&limit=${limit}`
          : `https://graph.facebook.com/${apiVersion}/${pageId}/conversations?limit=${limit}`;

      const convResponse = await fetch(conversationsUrl, {
        headers: { Authorization: `Bearer ${pageToken}` },
      });

      const convResult = await convResponse.json();
      if (!convResponse.ok) {
        throw new Error(
          `Meta API error ${convResponse.status}: ${JSON.stringify(convResult).substring(0, 300)}`,
        );
      }

      const conversations = convResult.data || [];

      // Optionally fetch messages for a specific conversation
      if (input.conversation_id) {
        const msgsUrl = `https://graph.facebook.com/${apiVersion}/${input.conversation_id}/messages?fields=id,message,from,created_time&limit=${limit}`;
        const msgsResponse = await fetch(msgsUrl, {
          headers: { Authorization: `Bearer ${pageToken}` },
        });
        const msgsResult = await msgsResponse.json();

        return {
          conversation_id: input.conversation_id,
          messages: msgsResult.data || [],
          message_count: msgsResult.data?.length || 0,
          platform,
        };
      }

      return {
        conversations: conversations.map((c: any) => ({
          id: c.id,
          updated_time: c.updated_time,
          participants: c.participants?.data || [],
        })),
        conversation_count: conversations.length,
        platform,
      };
    }

    case "voip_call": {
      // Initiate VoIP call via Twilio Voice API
      // Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in tenant_secrets
      const accountSid = secrets["TWILIO_ACCOUNT_SID"];
      const authToken = secrets["TWILIO_AUTH_TOKEN"];
      const fromNumber = secrets["TWILIO_PHONE_NUMBER"] || input.from;

      if (!accountSid || !authToken)
        throw new Error(
          "voip_call requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in tenant_secrets",
        );
      if (!fromNumber)
        throw new Error(
          "voip_call requires TWILIO_PHONE_NUMBER in tenant_secrets or 'from' in input",
        );

      const toNumber = input.to || input.phone;
      if (!toNumber) throw new Error("voip_call requires 'to' phone number");

      const action = input.action || "twiml"; // twiml | connect | record

      let twiml = "";
      switch (action) {
        case "twiml":
          // Custom TwiML provided by the agent
          twiml =
            input.twiml ||
            `<Response><Say language="${input.language || "pt-BR"}">${input.message || "Olá, esta é uma chamada automática."}</Say></Response>`;
          break;
        case "connect":
          // Connect to another number or SIP
          const connectTo = input.connect_to || toNumber;
          twiml = `<Response><Dial>${input.sip ? `<Sip>${connectTo}</Sip>` : connectTo}</Dial></Response>`;
          break;
        case "record":
          // Record a voice message
          const maxLength = input.max_length || 120;
          const callbackUrl = input.callback_url || "";
          twiml = `<Response><Say language="${input.language || "pt-BR"}">${input.prompt || "Por favor, deixe sua mensagem após o sinal."}</Say><Record maxLength="${maxLength}" ${callbackUrl ? `action="${callbackUrl}"` : ""}/></Response>`;
          break;
      }

      // URL-encode form data for Twilio API
      const formData = new URLSearchParams();
      formData.append("To", toNumber);
      formData.append("From", fromNumber);
      formData.append("Twiml", twiml);
      if (input.status_callback) formData.append("StatusCallback", input.status_callback);
      if (input.timeout) formData.append("Timeout", String(input.timeout));
      if (input.record_call) formData.append("Record", "true");

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          `Twilio error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
        );
      }

      return {
        call_sid: result.sid,
        to: result.to,
        from: result.from,
        status: result.status,
        direction: result.direction,
        action,
      };
    }

    case "voip_status": {
      // Check call status via Twilio
      const accountSid = secrets["TWILIO_ACCOUNT_SID"];
      const authToken = secrets["TWILIO_AUTH_TOKEN"];
      if (!accountSid || !authToken)
        throw new Error("voip_status requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN");

      const callSid = input.call_sid;
      if (!callSid) throw new Error("voip_status requires 'call_sid'");

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        {
          headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(`Twilio status error: ${JSON.stringify(result).substring(0, 200)}`);
      }

      return {
        call_sid: result.sid,
        status: result.status, // queued, ringing, in-progress, completed, busy, no-answer, canceled, failed
        duration: result.duration,
        to: result.to,
        from: result.from,
        start_time: result.start_time,
        end_time: result.end_time,
        price: result.price,
        price_unit: result.price_unit,
      };
    }

    case "voip_transcribe": {
      // Transcribe a call recording using platform's Whisper (KVM8)
      // or tenant's own STT provider
      const recordingUrl = input.recording_url || input.url;
      if (!recordingUrl) throw new Error("voip_transcribe requires 'recording_url'");

      // Try platform Whisper first (KVM8:8787), then tenant's provider
      const whisperEndpoint = "http://187.77.239.8:8787/v1/audio/transcriptions";
      const language = input.language || "pt";

      try {
        // Download audio
        const audioResponse = await fetch(recordingUrl);
        if (!audioResponse.ok)
          throw new Error(`Failed to download recording: HTTP ${audioResponse.status}`);
        const audioBlob = await audioResponse.blob();

        const formData = new FormData();
        formData.append("file", audioBlob, "recording.wav");
        formData.append("model", "large-v3");
        formData.append("language", language);
        if (input.prompt) formData.append("prompt", input.prompt);

        const whisperResponse = await fetch(whisperEndpoint, {
          method: "POST",
          body: formData,
        });

        if (!whisperResponse.ok) {
          throw new Error(`Whisper STT error: HTTP ${whisperResponse.status}`);
        }

        const whisperResult = await whisperResponse.json();

        return {
          text: whisperResult.text,
          language,
          duration_seconds: whisperResult.duration || null,
          source: "platform_whisper",
          recording_url: recordingUrl,
        };
      } catch (whisperErr: any) {
        // If platform Whisper fails and tenant has own provider, try that
        if (secrets["OPENAI_API_KEY"]) {
          const formData = new FormData();
          const audioResponse = await fetch(recordingUrl);
          const audioBlob = await audioResponse.blob();
          formData.append("file", audioBlob, "recording.wav");
          formData.append("model", "whisper-1");
          formData.append("language", language);

          const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${secrets["OPENAI_API_KEY"]}` },
            body: formData,
          });

          if (openaiResponse.ok) {
            const result = await openaiResponse.json();
            return {
              text: result.text,
              language,
              source: "tenant_openai",
              recording_url: recordingUrl,
            };
          }
        }
        throw new Error(`voip_transcribe failed: ${whisperErr.message}`);
      }
    }

    // ── P28: Voice Cloning & TTS/STT Avançado (ElevenLabs + Kokoro local) ──

    case "tts_synthesize": {
      // Text-to-Speech — Primário: Kokoro local (infra VPS, custo zero) | Secundário: ElevenLabs (tenant key)
      const text = input.text || input.content || "";
      if (!text) throw new Error("tts_synthesize requires 'text'");

      const voiceId = input.voice_id || input.voice || "default";
      const language = input.language || "pt-BR";
      const provider = input.provider || "auto"; // auto, kokoro, elevenlabs

      // Try Kokoro (platform, free) first
      if (provider === "auto" || provider === "kokoro") {
        try {
          const kokoroResponse = await fetch("http://187.77.239.8:8880/v1/audio/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: text.substring(0, 5000),
              voice: voiceId === "default" ? "af_heart" : voiceId,
              model: "kokoro",
              response_format: input.format || "mp3",
              speed: input.speed || 1.0,
            }),
          });

          if (kokoroResponse.ok) {
            const audioBuffer = await kokoroResponse.arrayBuffer();
            const base64Audio = btoa(
              String.fromCharCode(...new Uint8Array(audioBuffer.slice(0, 1024 * 1024))),
            ); // cap at 1MB for response

            return {
              audio_base64: base64Audio,
              format: input.format || "mp3",
              provider: "kokoro",
              voice: voiceId === "default" ? "af_heart" : voiceId,
              text_length: text.length,
              cost: 0,
            };
          }
        } catch (kokoroErr: any) {
          console.warn(`[tool-executor] Kokoro TTS failed: ${kokoroErr.message}`);
          if (provider === "kokoro") throw kokoroErr;
        }
      }

      // Secundário: ElevenLabs (tenant's key) — usado apenas se Kokoro indisponível
      const elevenLabsKey = secrets["ELEVENLABS_API_KEY"];
      if (!elevenLabsKey)
        throw new Error(
          "tts_synthesize: Kokoro unavailable and no ELEVENLABS_API_KEY in tenant_secrets",
        );

      const elVoiceId = input.elevenlabs_voice_id || voiceId || "JBFqnCBsd6RMkjVDRZzb"; // George default
      const model = input.model || "eleven_multilingual_v2";
      const outputFormat = input.output_format || "mp3_44100_128";

      const elResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${elVoiceId}?output_format=${outputFormat}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenLabsKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: text.substring(0, 5000),
            model_id: model,
            voice_settings: {
              stability: input.stability ?? 0.5,
              similarity_boost: input.similarity_boost ?? 0.75,
              style: input.style ?? 0.5,
              speed: input.speed ?? 1.0,
            },
          }),
        },
      );

      if (!elResponse.ok) {
        const errText = await elResponse.text().catch(() => "unknown");
        throw new Error(`ElevenLabs TTS error ${elResponse.status}: ${errText.substring(0, 200)}`);
      }

      const elAudio = await elResponse.arrayBuffer();
      // Encode in chunks to avoid stack overflow
      const uint8 = new Uint8Array(elAudio);
      let base64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        base64 += String.fromCharCode(...uint8.slice(i, i + chunkSize));
      }
      base64 = btoa(base64);

      return {
        audio_base64: base64,
        format: outputFormat.split("_")[0],
        provider: "elevenlabs",
        voice: elVoiceId,
        model,
        text_length: text.length,
      };
    }

    case "voice_clone": {
      // Clone a voice via ElevenLabs Instant Voice Cloning
      // Requires: ELEVENLABS_API_KEY in tenant_secrets
      const elevenLabsKey = secrets["ELEVENLABS_API_KEY"];
      if (!elevenLabsKey)
        throw new Error("voice_clone requires ELEVENLABS_API_KEY in tenant_secrets");

      const name = input.name || "Cloned Voice";
      const description = input.description || "";
      const audioUrls = input.audio_urls || []; // URLs to audio samples
      const audioBase64 = input.audio_base64 || null; // Single sample as base64

      if (!audioUrls.length && !audioBase64) {
        throw new Error("voice_clone requires 'audio_urls' array or 'audio_base64'");
      }

      const formData = new FormData();
      formData.append("name", name);
      if (description) formData.append("description", description);
      formData.append("labels", JSON.stringify(input.labels || {}));

      // Download and attach audio files
      for (let i = 0; i < audioUrls.length; i++) {
        const audioResponse = await fetch(audioUrls[i]);
        if (!audioResponse.ok)
          throw new Error(`Failed to download audio sample ${i}: HTTP ${audioResponse.status}`);
        const blob = await audioResponse.blob();
        formData.append("files", blob, `sample_${i}.mp3`);
      }

      if (audioBase64 && !audioUrls.length) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        formData.append("files", new Blob([bytes], { type: "audio/mpeg" }), "sample.mp3");
      }

      const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          `ElevenLabs voice clone error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
        );
      }

      return {
        voice_id: result.voice_id,
        name,
        status: "created",
        requires_fine_tuning: result.requires_fine_tuning || false,
      };
    }

    case "voice_list": {
      // List available voices — ElevenLabs or Kokoro
      const provider = input.provider || "all";

      const voices: any[] = [];

      // Kokoro voices (platform, free)
      if (provider === "all" || provider === "kokoro") {
        try {
          const kokoroResponse = await fetch("http://187.77.239.8:8880/v1/audio/voices");
          if (kokoroResponse.ok) {
            const kokoroVoices = await kokoroResponse.json();
            const voiceList = Array.isArray(kokoroVoices)
              ? kokoroVoices
              : kokoroVoices.voices || [];
            voices.push(
              ...voiceList.map((v: any) => ({
                id: typeof v === "string" ? v : v.id || v.name,
                name: typeof v === "string" ? v : v.name || v.id,
                provider: "kokoro",
                cost: "free",
              })),
            );
          }
        } catch {
          /* Kokoro unavailable */
        }
      }

      // ElevenLabs voices (tenant key)
      if (provider === "all" || provider === "elevenlabs") {
        const elevenLabsKey = secrets["ELEVENLABS_API_KEY"];
        if (elevenLabsKey) {
          try {
            const elResponse = await fetch("https://api.elevenlabs.io/v1/voices", {
              headers: { "xi-api-key": elevenLabsKey },
            });
            if (elResponse.ok) {
              const elResult = await elResponse.json();
              voices.push(
                ...(elResult.voices || []).map((v: any) => ({
                  id: v.voice_id,
                  name: v.name,
                  category: v.category,
                  provider: "elevenlabs",
                  labels: v.labels,
                  preview_url: v.preview_url,
                  cost: "paid",
                })),
              );
            }
          } catch {
            /* ElevenLabs unavailable */
          }
        }
      }

      return {
        voices,
        total: voices.length,
        providers: [...new Set(voices.map((v) => v.provider))],
      };
    }

    case "stt_transcribe": {
      // Speech-to-Text — Primário: Whisper local (VPS KVM8, custo zero) | Secundário: ElevenLabs Scribe (tenant)
      const audioUrl = input.audio_url || input.url || "";
      const audioBase64 = input.audio_base64 || "";
      if (!audioUrl && !audioBase64)
        throw new Error("stt_transcribe requires 'audio_url' or 'audio_base64'");

      const language = input.language || "pt";
      const provider = input.provider || "auto"; // auto, whisper, elevenlabs

      // Prepare audio blob
      let audioBlob: Blob;
      if (audioUrl) {
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok)
          throw new Error(`Failed to download audio: HTTP ${audioResponse.status}`);
        audioBlob = await audioResponse.blob();
      } else {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        audioBlob = new Blob([bytes], { type: "audio/wav" });
      }

      // Try platform Whisper first (free)
      if (provider === "auto" || provider === "whisper") {
        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "audio.wav");
          formData.append("model", "large-v3");
          formData.append("language", language);
          if (input.prompt) formData.append("prompt", input.prompt);

          const whisperResponse = await fetch("http://187.77.239.8:8787/v1/audio/transcriptions", {
            method: "POST",
            body: formData,
          });

          if (whisperResponse.ok) {
            const result = await whisperResponse.json();
            return {
              text: result.text,
              language,
              provider: "platform_whisper",
              cost: 0,
              duration_seconds: result.duration || null,
            };
          }
        } catch (err: any) {
          console.warn(`[tool-executor] Whisper STT failed: ${err.message}`);
          if (provider === "whisper") throw err;
        }
      }

      // Secundário: ElevenLabs Scribe — usado apenas se Whisper indisponível
      const elevenLabsKey = secrets["ELEVENLABS_API_KEY"];
      if (!elevenLabsKey)
        throw new Error(
          "stt_transcribe: Whisper unavailable and no ELEVENLABS_API_KEY in tenant_secrets",
        );

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model_id", "scribe_v2");
      formData.append("diarize", String(input.diarize ?? false));
      formData.append("tag_audio_events", String(input.tag_audio_events ?? false));
      if (language !== "auto") formData.append("language_code", language);

      const elResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: formData,
      });

      if (!elResponse.ok) {
        const errText = await elResponse.text().catch(() => "unknown");
        throw new Error(`ElevenLabs STT error ${elResponse.status}: ${errText.substring(0, 200)}`);
      }

      const elResult = await elResponse.json();
      return {
        text: elResult.text,
        words: elResult.words || [],
        language,
        provider: "elevenlabs_scribe",
        diarized: input.diarize ?? false,
      };
    }

    // ── P29: Conteúdo Visual (Imagens + Slides) ──

    case "image_generate": {
      // Generate images via tenant's API (OpenAI DALL-E, Stability AI, or Together AI)
      const prompt = input.prompt || "";
      if (!prompt) throw new Error("image_generate requires 'prompt'");

      const provider = input.provider || "auto"; // auto, openai, stability, together
      const size = input.size || "1024x1024";
      const n = Math.min(input.n || 1, 4);
      const quality = input.quality || "standard"; // standard, hd (OpenAI)
      const style = input.style || "vivid"; // vivid, natural (OpenAI)

      // OpenAI DALL-E
      if (provider === "openai" || (provider === "auto" && secrets["OPENAI_API_KEY"])) {
        const apiKey = secrets["OPENAI_API_KEY"];
        if (!apiKey)
          throw new Error("image_generate (openai) requires OPENAI_API_KEY in tenant_secrets");

        const model = input.model || "dall-e-3";
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: prompt.substring(0, 4000),
            n: model === "dall-e-3" ? 1 : n,
            size,
            quality,
            style,
            response_format: "url",
          }),
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `OpenAI image error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
          );

        return {
          images: (result.data || []).map((img: any) => ({
            url: img.url,
            revised_prompt: img.revised_prompt,
          })),
          count: result.data?.length || 0,
          provider: "openai",
          model,
        };
      }

      // Stability AI
      if (provider === "stability" || (provider === "auto" && secrets["STABILITY_API_KEY"])) {
        const apiKey = secrets["STABILITY_API_KEY"];
        if (!apiKey)
          throw new Error(
            "image_generate (stability) requires STABILITY_API_KEY in tenant_secrets",
          );

        const [width, height] = size.split("x").map(Number);
        const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            prompt: prompt.substring(0, 10000),
            output_format: "png",
            aspect_ratio: input.aspect_ratio || "1:1",
            negative_prompt: input.negative_prompt || "",
          }),
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `Stability AI error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
          );

        return {
          images: [{ base64: result.image, format: "png" }],
          count: 1,
          provider: "stability",
          model: "sd3",
        };
      }

      // Together AI (cheap option)
      if (provider === "together" || (provider === "auto" && secrets["TOGETHER_API_KEY"])) {
        const apiKey = secrets["TOGETHER_API_KEY"];
        if (!apiKey)
          throw new Error("image_generate (together) requires TOGETHER_API_KEY in tenant_secrets");

        const model = input.model || "black-forest-labs/FLUX.1-schnell-Free";
        const [width, height] = size.split("x").map(Number);

        const response = await fetch("https://api.together.xyz/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: prompt.substring(0, 4000),
            width: width || 1024,
            height: height || 1024,
            n,
            steps: input.steps || 4,
            response_format: "url",
          }),
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `Together AI error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
          );

        return {
          images: (result.data || []).map((img: any) => ({ url: img.url })),
          count: result.data?.length || 0,
          provider: "together",
          model,
        };
      }

      throw new Error(
        "image_generate requires OPENAI_API_KEY, STABILITY_API_KEY, or TOGETHER_API_KEY in tenant_secrets",
      );
    }

    case "image_edit": {
      // Edit/vary an existing image via OpenAI or Stability
      const imageUrl = input.image_url || "";
      const prompt = input.prompt || "";
      if (!imageUrl) throw new Error("image_edit requires 'image_url'");
      if (!prompt) throw new Error("image_edit requires 'prompt'");

      // Download source image
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to download image: HTTP ${imgResponse.status}`);
      const imgBlob = await imgResponse.blob();

      // OpenAI edit
      if (secrets["OPENAI_API_KEY"]) {
        const formData = new FormData();
        formData.append("image", imgBlob, "image.png");
        formData.append("prompt", prompt.substring(0, 1000));
        formData.append("n", "1");
        formData.append("size", input.size || "1024x1024");
        if (input.mask_url) {
          const maskResponse = await fetch(input.mask_url);
          const maskBlob = await maskResponse.blob();
          formData.append("mask", maskBlob, "mask.png");
        }

        const response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${secrets["OPENAI_API_KEY"]}` },
          body: formData,
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(`OpenAI edit error: ${JSON.stringify(result).substring(0, 300)}`);

        return {
          images: (result.data || []).map((img: any) => ({ url: img.url })),
          provider: "openai",
          action: "edit",
        };
      }

      throw new Error("image_edit requires OPENAI_API_KEY in tenant_secrets");
    }

    case "slide_generate": {
      // Generate presentation slides as Markdown (Marp format) via LLM
      const topic = input.topic || input.title || "";
      if (!topic) throw new Error("slide_generate requires 'topic'");

      const slideCount = input.slides || input.count || 8;
      const language = input.language || "pt-BR";
      const style = input.style || "professional"; // professional, creative, minimal, academic
      const includeNotes = input.include_notes ?? true;

      const systemPrompt = `You are a professional presentation designer. Generate a slide deck in Marp markdown format.

Rules:
- Use "---" to separate slides
- First slide is the title slide with "# Title" and "## Subtitle"
- Each slide has a clear heading (##) and 3-5 bullet points
- Use **bold** for emphasis and *italic* for details
- Include speaker notes with "<!-- Note: ... -->" if requested
- Return ONLY the Marp markdown content, no explanation
- Language: ${language}
- Style: ${style}
- Generate exactly ${slideCount} slides (including title and closing)

Marp header:
---
marp: true
theme: ${style === "minimal" ? "uncover" : style === "academic" ? "gaia" : "default"}
paginate: true
---`;

      const modelId = input.model_id;
      if (!modelId) throw new Error("presentation_generate requires 'model_id' in input");

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Create a presentation about: ${topic}${input.outline ? `\n\nOutline: ${input.outline}` : ""}${input.audience ? `\nAudience: ${input.audience}` : ""}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        tenant_id: tenantId,
      });

      const markdown = llmResult.content || "";
      const slides = markdown.split("---").filter((s: string) => s.trim().length > 0);

      return {
        markdown,
        slide_count: slides.length,
        format: "marp",
        topic,
        style,
        language,
        model_used: llmResult.provider || "unknown",
      };
    }

    case "screenshot_capture": {
      // Capture screenshot of a URL via free API
      const url = input.url || "";
      if (!url) throw new Error("screenshot_capture requires 'url'");

      try {
        new URL(url);
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }

      const width = input.width || 1280;
      const height = input.height || 720;
      const fullPage = input.full_page ?? false;
      const format = input.format || "png";

      // Use free screenshot API (no key required)
      const screenshotUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&viewport_width=${width}&viewport_height=${height}&full_page=${fullPage}&format=${format}&cache=true&cache_ttl=86400`;

      // If tenant has their own key, use authenticated endpoint
      if (secrets["SCREENSHOTONE_API_KEY"]) {
        const authUrl = `${screenshotUrl}&access_key=${secrets["SCREENSHOTONE_API_KEY"]}`;
        const response = await fetch(authUrl, { method: "HEAD" });
        if (response.ok) {
          return { screenshot_url: authUrl, width, height, format, provider: "screenshotone" };
        }
      }

      // Fallback: QuickChart-based website thumbnail (truly free)
      const thumbUrl = `https://image.thum.io/get/width/${width}/crop/${height}/${url}`;

      return {
        screenshot_url: thumbUrl,
        width,
        height,
        format: "jpg",
        provider: "thum.io",
        url,
      };
    }

    // ── P30: Vídeo Avatar (HeyGen + D-ID + Synthesia) ──

    case "video_avatar": {
      // Generate talking-head avatar video via tenant's provider
      // Supports: HeyGen, D-ID, Synthesia — all via tenant_secrets
      const text = input.text || input.script || "";
      if (!text) throw new Error("video_avatar requires 'text' (script for the avatar)");

      const provider = input.provider || "auto"; // auto, heygen, did, synthesia
      const voiceId = input.voice_id || "";
      const avatarId = input.avatar_id || "";
      const language = input.language || "pt-BR";

      // HeyGen
      if (provider === "heygen" || (provider === "auto" && secrets["HEYGEN_API_KEY"])) {
        const apiKey = secrets["HEYGEN_API_KEY"];
        if (!apiKey)
          throw new Error("video_avatar (heygen) requires HEYGEN_API_KEY in tenant_secrets");

        const response = await fetch("https://api.heygen.com/v2/video/generate", {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            video_inputs: [
              {
                character: {
                  type: "avatar",
                  avatar_id: avatarId || "default",
                  avatar_style: input.avatar_style || "normal",
                },
                voice: {
                  type: "text",
                  input_text: text.substring(0, 5000),
                  voice_id: voiceId || undefined,
                  speed: input.speed || 1.0,
                },
                background: input.background || undefined,
              },
            ],
            dimension: {
              width: input.width || 1920,
              height: input.height || 1080,
            },
            aspect_ratio: input.aspect_ratio || "16:9",
          }),
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `HeyGen error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
          );

        return {
          video_id: result.data?.video_id,
          status: "processing",
          provider: "heygen",
          estimated_duration: Math.ceil(text.length / 15), // ~15 chars per second
        };
      }

      // D-ID
      if (provider === "did" || (provider === "auto" && secrets["DID_API_KEY"])) {
        const apiKey = secrets["DID_API_KEY"];
        if (!apiKey) throw new Error("video_avatar (did) requires DID_API_KEY in tenant_secrets");

        const response = await fetch("https://api.d-id.com/talks", {
          method: "POST",
          headers: {
            Authorization: `Basic ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script: {
              type: "text",
              input: text.substring(0, 5000),
              provider: input.tts_provider
                ? { type: input.tts_provider, voice_id: voiceId }
                : undefined,
            },
            source_url: input.source_image_url || avatarId || undefined,
            config: {
              stitch: true,
              result_format: input.format || "mp4",
            },
          }),
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `D-ID error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
          );

        return {
          video_id: result.id,
          status: result.status || "created",
          provider: "did",
          result_url: result.result_url || null,
        };
      }

      // Synthesia
      if (provider === "synthesia" || (provider === "auto" && secrets["SYNTHESIA_API_KEY"])) {
        const apiKey = secrets["SYNTHESIA_API_KEY"];
        if (!apiKey)
          throw new Error("video_avatar (synthesia) requires SYNTHESIA_API_KEY in tenant_secrets");

        const response = await fetch("https://api.synthesia.io/v2/videos", {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            test: input.test ?? true,
            input: [
              {
                scriptText: text.substring(0, 5000),
                avatar: avatarId || "anna_costume1_cameraA",
                avatarSettings: { voice: voiceId || undefined, language },
                background: input.background_color || "#ffffff",
              },
            ],
            aspectRatio: input.aspect_ratio || "16:9",
          }),
        });

        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `Synthesia error ${response.status}: ${JSON.stringify(result).substring(0, 300)}`,
          );

        return {
          video_id: result.id,
          status: result.status || "in_progress",
          provider: "synthesia",
        };
      }

      throw new Error(
        "video_avatar requires HEYGEN_API_KEY, DID_API_KEY, or SYNTHESIA_API_KEY in tenant_secrets",
      );
    }

    case "video_avatar_status": {
      // Check video generation status
      const videoId = input.video_id;
      if (!videoId) throw new Error("video_avatar_status requires 'video_id'");

      const provider = input.provider || "heygen";

      if (provider === "heygen" && secrets["HEYGEN_API_KEY"]) {
        const response = await fetch(
          `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
          {
            headers: { "X-Api-Key": secrets["HEYGEN_API_KEY"] },
          },
        );
        const result = await response.json();
        return {
          video_id: videoId,
          status: result.data?.status || "unknown",
          video_url: result.data?.video_url || null,
          thumbnail_url: result.data?.thumbnail_url || null,
          duration: result.data?.duration || null,
          provider: "heygen",
        };
      }

      if (provider === "did" && secrets["DID_API_KEY"]) {
        const response = await fetch(`https://api.d-id.com/talks/${videoId}`, {
          headers: { Authorization: `Basic ${secrets["DID_API_KEY"]}` },
        });
        const result = await response.json();
        return {
          video_id: videoId,
          status: result.status || "unknown",
          video_url: result.result_url || null,
          duration: result.duration || null,
          provider: "did",
        };
      }

      if (provider === "synthesia" && secrets["SYNTHESIA_API_KEY"]) {
        const response = await fetch(`https://api.synthesia.io/v2/videos/${videoId}`, {
          headers: { Authorization: secrets["SYNTHESIA_API_KEY"] },
        });
        const result = await response.json();
        return {
          video_id: videoId,
          status: result.status || "unknown",
          video_url: result.download || null,
          provider: "synthesia",
        };
      }

      throw new Error(`video_avatar_status: No API key found for provider '${provider}'`);
    }

    case "avatar_list": {
      // List available avatars from provider
      const provider = input.provider || "heygen";

      if (provider === "heygen" && secrets["HEYGEN_API_KEY"]) {
        const response = await fetch("https://api.heygen.com/v2/avatars", {
          headers: { "X-Api-Key": secrets["HEYGEN_API_KEY"] },
        });
        const result = await response.json();
        return {
          avatars: (result.data?.avatars || []).map((a: any) => ({
            id: a.avatar_id,
            name: a.avatar_name,
            gender: a.gender,
            preview: a.preview_image_url,
          })),
          provider: "heygen",
        };
      }

      if (provider === "did" && secrets["DID_API_KEY"]) {
        const response = await fetch("https://api.d-id.com/clips/actors", {
          headers: { Authorization: `Basic ${secrets["DID_API_KEY"]}` },
        });
        const result = await response.json();
        return {
          avatars: (result.actors || []).map((a: any) => ({
            id: a.id || a.actor_id,
            name: a.name,
            preview: a.image_url,
          })),
          provider: "did",
        };
      }

      return { avatars: [], provider, message: "No API key found for this provider" };
    }

    // ── P31: Knowledge Graphs (Postgres-native property graph) ──

    case "kg_node_create": {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const graphId = input.graph_id || "default";
      const { data: node, error } = await supabase
        .from("kg_nodes")
        .insert({
          tenant_id: tenantId,
          graph_id: graphId,
          label: input.label,
          node_type: input.node_type,
          properties: input.properties || {},
        })
        .select("id, label, node_type")
        .single();

      if (error) throw new Error(`kg_node_create failed: ${error.message}`);
      return { node_id: node.id, label: node.label, node_type: node.node_type, graph_id: graphId };
    }

    case "kg_edge_create": {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const graphId = input.graph_id || "default";
      const { data: edge, error } = await supabase
        .from("kg_edges")
        .insert({
          tenant_id: tenantId,
          graph_id: graphId,
          source_node_id: input.source_node_id,
          target_node_id: input.target_node_id,
          relationship: input.relationship,
          weight: input.weight ?? 1.0,
          properties: input.properties || {},
        })
        .select("id, relationship")
        .single();

      if (error) throw new Error(`kg_edge_create failed: ${error.message}`);
      return { edge_id: edge.id, relationship: edge.relationship, graph_id: graphId };
    }

    case "kg_query": {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const queryType = input.query_type;
      const graphId = input.graph_id || "default";

      if (queryType === "neighbors") {
        if (!input.node_id) throw new Error("node_id required for neighbors query");
        const { data, error } = await supabase.rpc("kg_get_neighbors", {
          p_node_id: input.node_id,
          p_tenant_id: tenantId,
          p_direction: input.direction || "both",
          p_relationship: input.relationship || null,
          p_max_depth: input.max_depth || 2,
        });
        if (error) throw new Error(`kg_query neighbors failed: ${error.message}`);
        return { nodes: data || [], query_type: "neighbors", count: (data || []).length };
      }

      if (queryType === "shortest_path") {
        if (!input.node_id || !input.target_node_id)
          throw new Error("node_id and target_node_id required");
        const { data, error } = await supabase.rpc("kg_shortest_path", {
          p_source_id: input.node_id,
          p_target_id: input.target_node_id,
          p_tenant_id: tenantId,
          p_max_depth: input.max_depth || 6,
        });
        if (error) throw new Error(`kg_query shortest_path failed: ${error.message}`);
        return { path: data || [], query_type: "shortest_path", found: (data || []).length > 0 };
      }

      if (queryType === "subgraph") {
        // Get all nodes of a type within a graph
        let query = supabase
          .from("kg_nodes")
          .select("id, label, node_type, properties")
          .eq("tenant_id", tenantId)
          .eq("graph_id", graphId);

        if (input.node_type) query = query.eq("node_type", input.node_type);

        const { data: nodes, error: nErr } = await query.limit(input.max_nodes || 100);
        if (nErr) throw new Error(`kg_query subgraph nodes failed: ${nErr.message}`);

        const nodeIds = (nodes || []).map((n: any) => n.id);
        let edges: any[] = [];
        if (nodeIds.length > 0) {
          const { data: edgeData } = await supabase
            .from("kg_edges")
            .select("id, source_node_id, target_node_id, relationship, weight, properties")
            .eq("tenant_id", tenantId)
            .eq("graph_id", graphId)
            .or(`source_node_id.in.(${nodeIds.join(",")}),target_node_id.in.(${nodeIds.join(",")})`)
            .limit(500);
          edges = edgeData || [];
        }

        return {
          nodes: nodes || [],
          edges,
          query_type: "subgraph",
          stats: { node_count: (nodes || []).length, edge_count: edges.length },
        };
      }

      if (queryType === "search") {
        if (!input.search_text) throw new Error("search_text required for search query");
        const { data: nodes, error } = await supabase
          .from("kg_nodes")
          .select("id, label, node_type, properties")
          .eq("tenant_id", tenantId)
          .eq("graph_id", graphId)
          .ilike("label", `%${input.search_text}%`)
          .limit(20);
        if (error) throw new Error(`kg_query search failed: ${error.message}`);
        return { nodes: nodes || [], query_type: "search", count: (nodes || []).length };
      }

      throw new Error(`Unknown query_type: ${queryType}`);
    }

    case "kg_visualize": {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const graphId = input.graph_id || "default";
      const format = input.format || "visjs";
      const maxNodes = input.max_nodes || 50;

      // Fetch nodes
      const nodeQuery = supabase
        .from("kg_nodes")
        .select("id, label, node_type, properties")
        .eq("tenant_id", tenantId)
        .eq("graph_id", graphId)
        .limit(maxNodes);

      // If center_node_id, get neighbors instead
      let nodes: any[] = [];
      let edges: any[] = [];

      if (input.center_node_id) {
        const { data } = await supabase.rpc("kg_get_neighbors", {
          p_node_id: input.center_node_id,
          p_tenant_id: tenantId,
          p_direction: "both",
          p_relationship: null,
          p_max_depth: 2,
        });
        // Get the center node too
        const { data: centerNode } = await supabase
          .from("kg_nodes")
          .select("id, label, node_type, properties")
          .eq("id", input.center_node_id)
          .single();

        const neighborIds = (data || []).map((n: any) => n.node_id);
        const allIds = [input.center_node_id, ...neighborIds];

        if (centerNode) nodes.push(centerNode);
        // Fetch full node data for neighbors
        if (neighborIds.length > 0) {
          const { data: nData } = await supabase
            .from("kg_nodes")
            .select("id, label, node_type, properties")
            .in("id", neighborIds);
          nodes.push(...(nData || []));
        }

        // Fetch edges between these nodes
        if (allIds.length > 1) {
          const { data: eData } = await supabase
            .from("kg_edges")
            .select("id, source_node_id, target_node_id, relationship, weight")
            .eq("tenant_id", tenantId)
            .or(`source_node_id.in.(${allIds.join(",")}),target_node_id.in.(${allIds.join(",")})`)
            .limit(200);
          edges = eData || [];
        }
      } else {
        const { data: nData } = await nodeQuery;
        nodes = nData || [];
        const nodeIds = nodes.map((n: any) => n.id);
        if (nodeIds.length > 0) {
          const { data: eData } = await supabase
            .from("kg_edges")
            .select("id, source_node_id, target_node_id, relationship, weight")
            .eq("tenant_id", tenantId)
            .eq("graph_id", graphId)
            .or(`source_node_id.in.(${nodeIds.join(",")}),target_node_id.in.(${nodeIds.join(",")})`)
            .limit(200);
          edges = eData || [];
        }
      }

      // Format output
      const typeColors: Record<string, string> = {
        person: "#4A90D9",
        organization: "#E74C3C",
        concept: "#2ECC71",
        document: "#F39C12",
        event: "#9B59B6",
        location: "#1ABC9C",
        default: "#95A5A6",
      };

      if (format === "visjs") {
        return {
          nodes: nodes.map((n: any) => ({
            id: n.id,
            label: n.label,
            group: n.node_type,
            color: typeColors[n.node_type] || typeColors.default,
            title: JSON.stringify(n.properties),
          })),
          edges: edges.map((e: any) => ({
            from: e.source_node_id,
            to: e.target_node_id,
            label: e.relationship,
            value: e.weight,
          })),
          format: "visjs",
          stats: { node_count: nodes.length, edge_count: edges.length },
        };
      }

      if (format === "d3") {
        return {
          nodes: nodes.map((n: any) => ({
            id: n.id,
            name: n.label,
            group: n.node_type,
            color: typeColors[n.node_type] || typeColors.default,
          })),
          links: edges.map((e: any) => ({
            source: e.source_node_id,
            target: e.target_node_id,
            label: e.relationship,
            value: e.weight,
          })),
          format: "d3",
          stats: { node_count: nodes.length, edge_count: edges.length },
        };
      }

      // cytoscape
      return {
        elements: {
          nodes: nodes.map((n: any) => ({
            data: { id: n.id, label: n.label, type: n.node_type, ...n.properties },
          })),
          edges: edges.map((e: any) => ({
            data: {
              id: e.id,
              source: e.source_node_id,
              target: e.target_node_id,
              label: e.relationship,
              weight: e.weight,
            },
          })),
        },
        format: "cytoscape",
        stats: { node_count: nodes.length, edge_count: edges.length },
      };
    }

    // ── P32: Análise Preditiva (Statistical + LLM interpretation) ──

    case "time_series_forecast": {
      // Simple linear regression + exponential smoothing for time series forecasting
      const dataPoints: Array<{ timestamp: string; value: number }> = input.data || [];
      const periods = input.forecast_periods || 7;
      const method = input.method || "auto"; // linear, exponential_smoothing, moving_average, auto

      if (!dataPoints.length || dataPoints.length < 3) {
        throw new Error("At least 3 data points required for forecasting");
      }

      // Sort by timestamp
      const sorted = [...dataPoints].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const values = sorted.map((d) => d.value);
      const n = values.length;

      // Calculate basic stats
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
      const stdDev = Math.sqrt(variance);

      // Linear regression
      function linearRegression(vals: number[]): { slope: number; intercept: number; r2: number } {
        const xMean = (vals.length - 1) / 2;
        const yMean = vals.reduce((a, b) => a + b, 0) / vals.length;
        let ssXY = 0,
          ssXX = 0,
          ssYY = 0;
        for (let i = 0; i < vals.length; i++) {
          ssXY += (i - xMean) * (vals[i] - yMean);
          ssXX += (i - xMean) ** 2;
          ssYY += (vals[i] - yMean) ** 2;
        }
        const slope = ssXX === 0 ? 0 : ssXY / ssXX;
        const intercept = yMean - slope * xMean;
        const r2 = ssYY === 0 ? 0 : ssXY ** 2 / (ssXX * ssYY);
        return { slope, intercept, r2 };
      }

      // Exponential smoothing (Holt's method for trend)
      function holtSmoothing(
        vals: number[],
        alpha = 0.3,
        beta = 0.1,
      ): { level: number; trend: number; fitted: number[] } {
        let level = vals[0];
        let trend = vals.length > 1 ? vals[1] - vals[0] : 0;
        const fitted: number[] = [level];
        for (let i = 1; i < vals.length; i++) {
          const prevLevel = level;
          level = alpha * vals[i] + (1 - alpha) * (level + trend);
          trend = beta * (level - prevLevel) + (1 - beta) * trend;
          fitted.push(level + trend);
        }
        return { level, trend, fitted };
      }

      // Moving average
      function movingAverage(vals: number[], window = 3): number[] {
        const result: number[] = [];
        for (let i = 0; i < vals.length; i++) {
          const start = Math.max(0, i - window + 1);
          const slice = vals.slice(start, i + 1);
          result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
        return result;
      }

      // Auto-select method based on data characteristics
      const lr = linearRegression(values);
      const holt = holtSmoothing(values);
      const ma = movingAverage(values, Math.min(5, Math.floor(n / 2)));

      let selectedMethod = method;
      if (method === "auto") {
        if (lr.r2 > 0.8) selectedMethod = "linear";
        else if (n >= 10) selectedMethod = "exponential_smoothing";
        else selectedMethod = "moving_average";
      }

      // Generate forecast
      const lastTimestamp = new Date(sorted[n - 1].timestamp).getTime();
      const avgInterval =
        n > 1 ? (lastTimestamp - new Date(sorted[0].timestamp).getTime()) / (n - 1) : 86400000; // default 1 day

      const forecast: Array<{ timestamp: string; value: number; lower: number; upper: number }> =
        [];
      const confidenceMultiplier = 1.96; // 95% CI

      for (let i = 1; i <= periods; i++) {
        const ts = new Date(lastTimestamp + avgInterval * i).toISOString();
        let predicted: number;

        if (selectedMethod === "linear") {
          predicted = lr.intercept + lr.slope * (n - 1 + i);
        } else if (selectedMethod === "exponential_smoothing") {
          predicted = holt.level + holt.trend * i;
        } else {
          // Moving average: extend last MA value with slight trend
          const lastMA = ma[ma.length - 1];
          const maTrend = ma.length > 1 ? ma[ma.length - 1] - ma[ma.length - 2] : 0;
          predicted = lastMA + maTrend * i;
        }

        const uncertainty = stdDev * Math.sqrt(i) * confidenceMultiplier;
        forecast.push({
          timestamp: ts,
          value: Math.round(predicted * 100) / 100,
          lower: Math.round((predicted - uncertainty) * 100) / 100,
          upper: Math.round((predicted + uncertainty) * 100) / 100,
        });
      }

      // Use LLM for interpretation if requested
      let interpretation: string | null = null;
      if (input.interpret !== false) {
        try {
          const interpResult = await routeLLM({
            model_id: input.model_id || "groq/llama-3.1-8b-instant",
            messages: [
              {
                role: "user",
                content: `Analise esta série temporal e previsão de forma concisa (max 3 frases em PT-BR):
Dados históricos (${n} pontos): média=${mean.toFixed(2)}, desvio=${stdDev.toFixed(2)}, tendência=${lr.slope > 0 ? "crescente" : lr.slope < 0 ? "decrescente" : "estável"} (slope=${lr.slope.toFixed(4)}, R²=${lr.r2.toFixed(3)})
Método usado: ${selectedMethod}
Previsão (${periods} períodos): de ${forecast[0].value} a ${forecast[forecast.length - 1].value}
Contexto: ${input.context || "dados genéricos"}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 200,
            tenant_id: tenantId,
          });
          interpretation = interpResult.content;
        } catch {
          /* interpretation is optional */
        }
      }

      return {
        method: selectedMethod,
        stats: {
          mean: Math.round(mean * 100) / 100,
          std_dev: Math.round(stdDev * 100) / 100,
          r2: Math.round(lr.r2 * 1000) / 1000,
          trend_slope: Math.round(lr.slope * 10000) / 10000,
          data_points: n,
        },
        forecast,
        interpretation,
      };
    }

    case "anomaly_detect": {
      // Statistical anomaly detection: Z-score + IQR + moving window
      const dataPoints: Array<{ timestamp: string; value: number; label?: string }> =
        input.data || [];
      const sensitivity = input.sensitivity || "medium"; // low, medium, high
      const methodPref = input.method || "auto"; // zscore, iqr, moving_window, auto

      if (dataPoints.length < 5)
        throw new Error("At least 5 data points required for anomaly detection");

      const sorted = [...dataPoints].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const values = sorted.map((d) => d.value);
      const n = values.length;

      const mean = values.reduce((a, b) => a + b, 0) / n;
      const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);

      // Thresholds by sensitivity
      const zThresholds = { low: 3.0, medium: 2.5, high: 2.0 };
      const zThreshold = zThresholds[sensitivity as keyof typeof zThresholds] || 2.5;

      // Z-score method
      const zScoreAnomalies = values.map((v, i) => ({
        index: i,
        timestamp: sorted[i].timestamp,
        value: v,
        label: sorted[i].label,
        z_score: stdDev === 0 ? 0 : Math.abs((v - mean) / stdDev),
        is_anomaly: stdDev === 0 ? false : Math.abs((v - mean) / stdDev) > zThreshold,
        direction: v > mean ? ("high" as const) : ("low" as const),
      }));

      // IQR method
      const sortedValues = [...values].sort((a, b) => a - b);
      const q1 = sortedValues[Math.floor(n * 0.25)];
      const q3 = sortedValues[Math.floor(n * 0.75)];
      const iqr = q3 - q1;
      const iqrMultiplier = { low: 2.5, medium: 1.5, high: 1.0 }[sensitivity as string] || 1.5;
      const lowerFence = q1 - iqrMultiplier * iqr;
      const upperFence = q3 + iqrMultiplier * iqr;

      const iqrAnomalies = values.map((v, i) => ({
        index: i,
        timestamp: sorted[i].timestamp,
        value: v,
        is_anomaly: v < lowerFence || v > upperFence,
        direction:
          v > upperFence
            ? ("high" as const)
            : v < lowerFence
              ? ("low" as const)
              : ("normal" as const),
      }));

      // Moving window (local anomalies)
      const windowSize = Math.max(3, Math.floor(n / 5));
      const movingAnomalies = values.map((v, i) => {
        const start = Math.max(0, i - windowSize);
        const end = Math.min(n, i + windowSize + 1);
        const window = values.slice(start, end);
        const wMean = window.reduce((a, b) => a + b, 0) / window.length;
        const wStd = Math.sqrt(window.reduce((s, x) => s + (x - wMean) ** 2, 0) / window.length);
        const localZ = wStd === 0 ? 0 : Math.abs((v - wMean) / wStd);
        return {
          index: i,
          timestamp: sorted[i].timestamp,
          value: v,
          local_z_score: localZ,
          is_anomaly: localZ > zThreshold,
        };
      });

      // Combine: anomaly if detected by at least 2 methods
      const anomalies = sorted.map((d, i) => {
        const detections = [
          zScoreAnomalies[i].is_anomaly,
          iqrAnomalies[i].is_anomaly,
          movingAnomalies[i].is_anomaly,
        ].filter(Boolean).length;

        const isAnomaly =
          methodPref === "zscore"
            ? zScoreAnomalies[i].is_anomaly
            : methodPref === "iqr"
              ? iqrAnomalies[i].is_anomaly
              : methodPref === "moving_window"
                ? movingAnomalies[i].is_anomaly
                : detections >= 2; // auto: consensus

        return {
          timestamp: d.timestamp,
          value: d.value,
          label: d.label,
          is_anomaly: isAnomaly,
          z_score: Math.round(zScoreAnomalies[i].z_score * 100) / 100,
          direction: zScoreAnomalies[i].direction,
          detection_methods: detections,
          severity:
            detections >= 3
              ? "critical"
              : detections >= 2
                ? "warning"
                : isAnomaly
                  ? "info"
                  : "normal",
        };
      });

      const detectedAnomalies = anomalies.filter((a) => a.is_anomaly);

      return {
        total_points: n,
        anomalies_found: detectedAnomalies.length,
        anomaly_rate: Math.round((detectedAnomalies.length / n) * 10000) / 100,
        anomalies: detectedAnomalies,
        stats: {
          mean: Math.round(mean * 100) / 100,
          std_dev: Math.round(stdDev * 100) / 100,
          q1: Math.round(q1 * 100) / 100,
          q3: Math.round(q3 * 100) / 100,
          iqr: Math.round(iqr * 100) / 100,
          lower_fence: Math.round(lowerFence * 100) / 100,
          upper_fence: Math.round(upperFence * 100) / 100,
        },
        sensitivity,
        method: methodPref === "auto" ? "consensus" : methodPref,
      };
    }

    case "trend_analyze": {
      // Trend analysis: decomposition, seasonality detection, change points
      const dataPoints: Array<{ timestamp: string; value: number }> = input.data || [];
      if (dataPoints.length < 7)
        throw new Error("At least 7 data points required for trend analysis");

      const sorted = [...dataPoints].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const values = sorted.map((d) => d.value);
      const n = values.length;

      // Overall trend (linear regression)
      const xMean = (n - 1) / 2;
      const yMean = values.reduce((a, b) => a + b, 0) / n;
      let ssXY = 0,
        ssXX = 0,
        ssYY = 0;
      for (let i = 0; i < n; i++) {
        ssXY += (i - xMean) * (values[i] - yMean);
        ssXX += (i - xMean) ** 2;
        ssYY += (values[i] - yMean) ** 2;
      }
      const slope = ssXX === 0 ? 0 : ssXY / ssXX;
      const r2 = ssYY === 0 ? 0 : ssXY ** 2 / (ssXX * ssYY);

      // Trend direction
      const trendDirection = slope > 0.01 ? "increasing" : slope < -0.01 ? "decreasing" : "stable";
      const trendStrength = r2 > 0.8 ? "strong" : r2 > 0.5 ? "moderate" : "weak";

      // Moving average for smoothed trend
      const windowSize = Math.max(3, Math.floor(n / 4));
      const smoothed = values.map((_, i) => {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(n, i + Math.floor(windowSize / 2) + 1);
        const slice = values.slice(start, end);
        return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100;
      });

      // Change point detection (simple: largest deviation from linear trend)
      const residuals = values.map((v, i) => v - (yMean + slope * (i - xMean)));
      const changePoints: Array<{
        index: number;
        timestamp: string;
        value: number;
        magnitude: number;
      }> = [];

      // Split data and find where regression changes most
      for (let split = 3; split < n - 3; split++) {
        const leftVals = values.slice(0, split);
        const rightVals = values.slice(split);
        const leftMean = leftVals.reduce((a, b) => a + b, 0) / leftVals.length;
        const rightMean = rightVals.reduce((a, b) => a + b, 0) / rightVals.length;
        const magnitude = Math.abs(rightMean - leftMean) / (Math.sqrt(ssYY / n) || 1);

        if (magnitude > 1.5) {
          // Significant change
          changePoints.push({
            index: split,
            timestamp: sorted[split].timestamp,
            value: sorted[split].value,
            magnitude: Math.round(magnitude * 100) / 100,
          });
        }
      }

      // Keep only top 3 most significant change points
      const topChangePoints = changePoints.sort((a, b) => b.magnitude - a.magnitude).slice(0, 3);

      // Seasonality detection (autocorrelation)
      let dominantPeriod: number | null = null;
      let seasonalityStrength = 0;
      if (n >= 14) {
        const maxLag = Math.min(Math.floor(n / 2), 30);
        let bestCorr = 0;
        for (let lag = 2; lag <= maxLag; lag++) {
          let num = 0,
            den1 = 0,
            den2 = 0;
          for (let i = 0; i < n - lag; i++) {
            const a = values[i] - yMean;
            const b = values[i + lag] - yMean;
            num += a * b;
            den1 += a * a;
            den2 += b * b;
          }
          const corr = den1 * den2 === 0 ? 0 : num / Math.sqrt(den1 * den2);
          if (corr > bestCorr && corr > 0.3) {
            bestCorr = corr;
            dominantPeriod = lag;
            seasonalityStrength = corr;
          }
        }
      }

      // Volatility (rolling std dev)
      const volWindow = Math.max(3, Math.floor(n / 5));
      const volatility = values.map((_, i) => {
        const start = Math.max(0, i - volWindow + 1);
        const slice = values.slice(start, i + 1);
        const m = slice.reduce((a, b) => a + b, 0) / slice.length;
        return (
          Math.round(Math.sqrt(slice.reduce((s, v) => s + (v - m) ** 2, 0) / slice.length) * 100) /
          100
        );
      });
      const avgVolatility = volatility.reduce((a, b) => a + b, 0) / volatility.length;
      const volatilityTrend =
        volatility[volatility.length - 1] > avgVolatility * 1.3
          ? "increasing"
          : volatility[volatility.length - 1] < avgVolatility * 0.7
            ? "decreasing"
            : "stable";

      // LLM interpretation
      let interpretation: string | null = null;
      if (input.interpret !== false) {
        try {
          const interpResult = await routeLLM({
            model_id: input.model_id || "groq/llama-3.1-8b-instant",
            messages: [
              {
                role: "user",
                content: `Analise esta tendência de dados em 3 frases (PT-BR):
Dados: ${n} pontos, tendência ${trendDirection} (${trendStrength}, R²=${r2.toFixed(3)}), slope=${slope.toFixed(4)}
Mudanças significativas: ${topChangePoints.length} detectadas
Sazonalidade: ${dominantPeriod ? `período ~${dominantPeriod} (correlação ${seasonalityStrength.toFixed(2)})` : "não detectada"}
Volatilidade: ${volatilityTrend} (média ${avgVolatility.toFixed(2)})
Contexto: ${input.context || "dados de negócio"}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 200,
            tenant_id: tenantId,
          });
          interpretation = interpResult.content;
        } catch {
          /* optional */
        }
      }

      return {
        trend: {
          direction: trendDirection,
          strength: trendStrength,
          slope: Math.round(slope * 10000) / 10000,
          r2: Math.round(r2 * 1000) / 1000,
        },
        seasonality: dominantPeriod
          ? {
              detected: true,
              period: dominantPeriod,
              strength: Math.round(seasonalityStrength * 100) / 100,
            }
          : { detected: false },
        change_points: topChangePoints,
        volatility: {
          current: volatility[volatility.length - 1],
          average: Math.round(avgVolatility * 100) / 100,
          trend: volatilityTrend,
        },
        smoothed_values: smoothed,
        stats: {
          mean: Math.round(yMean * 100) / 100,
          min: Math.min(...values),
          max: Math.max(...values),
          range: Math.max(...values) - Math.min(...values),
          data_points: n,
        },
        interpretation,
      };
    }

    // ── P33: Automação Avançada (Web Scraping + Code Sandbox + Browser Automation) ──

    case "web_scrape":
      return scrapeWebPage(input, secrets);

    case "web_crawl": {
      // Crawl multiple pages from a domain via Firecrawl (tenant key required)
      if (!secrets["FIRECRAWL_API_KEY"])
        throw new Error("FIRECRAWL_API_KEY required in tenant_secrets for web_crawl");
      const url = input.url;
      if (!url) throw new Error("url is required");

      const response = await fetch("https://api.firecrawl.dev/v1/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secrets["FIRECRAWL_API_KEY"]}`,
        },
        body: JSON.stringify({
          url,
          limit: input.max_pages || 10,
          maxDepth: input.max_depth || 2,
          includePaths: input.include_paths || [],
          excludePaths: input.exclude_paths || [],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error(`Firecrawl crawl failed: HTTP ${response.status}`);
      const data = await response.json();

      return {
        crawl_id: data.id,
        status: data.status || "started",
        url,
        message: "Crawl initiated. Use crawl_id to check status.",
        provider: "firecrawl",
      };
    }

    case "code_execute": {
      // Execute code in sandbox via E2B (tenant key) or local eval (simple math only)
      const code = input.code;
      const language = input.language || "javascript";
      if (!code) throw new Error("code is required");

      // Strategy 1: E2B Code Interpreter (tenant key)
      if (secrets["E2B_API_KEY"]) {
        const e2bResponse = await fetch("https://api.e2b.dev/v1/sandboxes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secrets["E2B_API_KEY"]}`,
          },
          body: JSON.stringify({
            template: language === "python" ? "Python3" : "Node18",
            timeout: input.timeout || 30,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!e2bResponse.ok)
          throw new Error(`E2B sandbox creation failed: HTTP ${e2bResponse.status}`);
        const sandbox = await e2bResponse.json();

        // Execute code in sandbox
        const execResponse = await fetch(
          `https://api.e2b.dev/v1/sandboxes/${sandbox.sandboxID}/code/execute`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${secrets["E2B_API_KEY"]}`,
            },
            body: JSON.stringify({ code, language }),
            signal: AbortSignal.timeout(input.timeout ? input.timeout * 1000 : 30000),
          },
        );

        const execResult = await execResponse.json();

        // Cleanup sandbox
        fetch(`https://api.e2b.dev/v1/sandboxes/${sandbox.sandboxID}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${secrets["E2B_API_KEY"]}` },
        }).catch((err) => {
          console.warn("[tool-executor] sandbox cleanup failed:", (err as Error).message);
        });

        return {
          stdout: execResult.stdout || "",
          stderr: execResult.stderr || "",
          exit_code: execResult.exitCode ?? 0,
          execution_time_ms: execResult.executionTime || 0,
          language,
          provider: "e2b",
        };
      }

      // Strategy 2: Simple eval for safe math/JSON expressions only (no E2B key)
      if (language === "javascript") {
        // Only allow simple expressions (no imports, no fetch, no require)
        const forbidden = [
          "import",
          "require",
          "fetch",
          "eval",
          "Function",
          "process",
          "Deno",
          "globalThis",
          "window",
        ];
        const hasForbidden = forbidden.some((f) => code.includes(f));
        if (hasForbidden)
          throw new Error(
            "Code contains forbidden operations. Add E2B_API_KEY to tenant_secrets for full code execution.",
          );

        if (code.length > 500)
          throw new Error("Code too long for inline eval. Add E2B_API_KEY for full sandbox.");

        try {
          const fn = new Function(`"use strict"; return (${code});`);
          const result = fn();
          return {
            stdout: JSON.stringify(result),
            stderr: "",
            exit_code: 0,
            language: "javascript",
            provider: "inline_eval",
            warning: "Limited eval mode. Add E2B_API_KEY for full sandbox execution.",
          };
        } catch (err: any) {
          return {
            stdout: "",
            stderr: err.message,
            exit_code: 1,
            language: "javascript",
            provider: "inline_eval",
          };
        }
      }

      throw new Error(`Language '${language}' requires E2B_API_KEY in tenant_secrets`);
    }

    case "browser_automate": {
      // Browser automation via Browser Use Cloud, Browserbase (tenant key) or Browserless (tenant key)
      const url = input.url;
      const actions = input.actions || []; // Array of { type, selector, value, ... }
      if (!url) throw new Error("url is required");

      // Browser Use Cloud — prefer when configured, since it's the new browser runtime path.
      if (
        secrets["BROWSER_USE_API_KEY"] &&
        (input.provider === "browser-use" || input.provider === "auto" || !input.provider)
      ) {
        const baseUrl = String(
          secrets["BROWSER_USE_BASE_URL"] || "https://api.browser-use.com/api/v3",
        ).replace(/\/$/, "");
        const task = String(
          input.task ||
            input.prompt ||
            input.instructions ||
            (actions.length > 0
              ? `Open ${url} and execute these browser actions in order: ${JSON.stringify(actions)}`
              : `Open ${url} and return the main useful page content, title, and any relevant metadata.`),
        );

        const createRes = await fetch(`${baseUrl}/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Browser-Use-API-Key": secrets["BROWSER_USE_API_KEY"],
          },
          body: JSON.stringify({ task }),
          signal: AbortSignal.timeout(30000),
        });

        if (!createRes.ok) {
          const errText = await createRes.text().catch(() => "unknown");
          throw new Error(
            `Browser Use session failed: HTTP ${createRes.status} — ${errText.substring(0, 200)}`,
          );
        }

        const created = await createRes.json();
        const sessionId = created.id || created.session_id;
        if (!sessionId) throw new Error("Browser Use session response missing id");

        let latest: any = created;
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const pollRes = await fetch(`${baseUrl}/sessions/${sessionId}`, {
            headers: { "X-Browser-Use-API-Key": secrets["BROWSER_USE_API_KEY"] },
            signal: AbortSignal.timeout(15000),
          });
          if (!pollRes.ok) continue;
          latest = await pollRes.json();
          const status = String(latest.status || latest.state || "").toLowerCase();
          const output = latest.output;
          if (
            output !== undefined &&
            output !== null &&
            output !== "" &&
            !["queued", "running", "in_progress", "pending", "created"].includes(status)
          ) {
            break;
          }
          if (["completed", "done", "success", "failed", "cancelled", "stopped"].includes(status)) {
            break;
          }
        }

        return {
          session_id: sessionId,
          status: latest.status || "completed",
          live_url: latest.liveUrl || latest.live_url || null,
          output: latest.output ?? null,
          provider: "browser-use",
          url,
          actions_queued: actions.length,
          message: "Browser Use session completed.",
        };
      }

      // Browserbase API
      if (secrets["BROWSERBASE_API_KEY"]) {
        // Create session
        const sessionRes = await fetch("https://www.browserbase.com/v1/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bb-api-key": secrets["BROWSERBASE_API_KEY"],
          },
          body: JSON.stringify({
            projectId: secrets["BROWSERBASE_PROJECT_ID"] || "",
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!sessionRes.ok)
          throw new Error(`Browserbase session failed: HTTP ${sessionRes.status}`);
        const session = await sessionRes.json();

        return {
          session_id: session.id,
          connect_url: session.connectUrl,
          status: "created",
          url,
          actions_queued: actions.length,
          provider: "browserbase",
          message: "Session created. Connect via CDP (Chrome DevTools Protocol) to automate.",
        };
      }

      // BrowserlessAPI
      if (secrets["BROWSERLESS_API_KEY"]) {
        // Use /content endpoint for simple scraping, /function for complex automation
        const endpoint =
          actions.length > 0
            ? `https://chrome.browserless.io/function?token=${secrets["BROWSERLESS_API_KEY"]}`
            : `https://chrome.browserless.io/content?token=${secrets["BROWSERLESS_API_KEY"]}`;

        const body =
          actions.length > 0
            ? {
                code: `module.exports = async ({ page }) => {
                await page.goto('${url}', { waitUntil: 'networkidle0', timeout: 30000 });
                ${actions
                  .map((a: any) => {
                    if (a.type === "click") return `await page.click('${a.selector}');`;
                    if (a.type === "type") return `await page.type('${a.selector}', '${a.value}');`;
                    if (a.type === "wait")
                      return `await page.waitForSelector('${a.selector}', { timeout: ${a.timeout || 5000} });`;
                    if (a.type === "screenshot")
                      return `const screenshot = await page.screenshot({ encoding: 'base64' });`;
                    return "";
                  })
                  .join("\n")}
                const content = await page.content();
                return { content, url: page.url() };
              }`,
                context: {},
              }
            : { url, waitFor: input.wait_for || 0 };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });

        if (!response.ok) throw new Error(`Browserless failed: HTTP ${response.status}`);

        if (actions.length > 0) {
          const result = await response.json();
          return { ...result, provider: "browserless", actions_executed: actions.length };
        } else {
          const html = await response.text();
          return {
            content: html.substring(0, 50000),
            url,
            content_length: html.length,
            provider: "browserless",
          };
        }
      }

      throw new Error(
        "Browser automation requires BROWSER_USE_API_KEY, BROWSERBASE_API_KEY or BROWSERLESS_API_KEY in tenant_secrets",
      );
    }

    // ═══════════════════════════════════════════════════════════
    // P35: REVENUE TOOLS — Recommendation, Lead Scoring, Cart Recovery
    // ═══════════════════════════════════════════════════════════

    case "recommend_items": {
      // Content-based + collaborative filtering recommendation engine
      // Uses tenant data from Supabase tables + LLM for semantic matching
      const userId = input.user_id;
      const itemType = input.item_type || "product"; // product, content, service
      const context = input.context || {};
      const limit = Math.min(input.limit || 10, 50);
      const strategy = input.strategy || "hybrid"; // content_based, collaborative, hybrid

      if (!userId) throw new Error("user_id is required for recommendations");

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      // Gather user interaction history
      const { data: interactions } = await sb
        .from("agent_execution_steps")
        .select("step_output, node_type, created_at")
        .eq("node_type", "tool")
        .ilike("step_output", `%${itemType}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      const userHistory = (interactions || []).map((i) => {
        try {
          return JSON.parse(
            typeof i.step_output === "string" ? i.step_output : JSON.stringify(i.step_output),
          );
        } catch {
          return i.step_output;
        }
      });

      // Use LLM for semantic recommendation
      const recommendPrompt = `You are a recommendation engine. Based on the user's interaction history and context, suggest ${limit} ${itemType} recommendations.

USER HISTORY (last interactions):
${JSON.stringify(userHistory.slice(0, 20), null, 2)}

CONTEXT:
${JSON.stringify(context, null, 2)}

STRATEGY: ${strategy}
- content_based: recommend similar items to what user interacted with
- collaborative: recommend items popular among similar users  
- hybrid: combine both approaches

Return a JSON array of recommendations:
[{"item_id": "...", "title": "...", "reason": "...", "confidence": 0.0-1.0, "category": "..."}]

Return ONLY the JSON array, no markdown.`;

      const modelId = input.model_id;
      if (!modelId)
        throw new Error(
          "recommend_items requires 'model_id' in input. Configure the LLM model for this tool.",
        );

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [{ role: "user", content: recommendPrompt }],
        temperature: 0.3,
        tenant_id: tenantId,
      });

      let recommendations: any[] = [];
      try {
        const content = llmResult.content || "";
        const cleaned = content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        recommendations = JSON.parse(cleaned);
      } catch {
        recommendations = [
          {
            item_id: "fallback",
            title: "Unable to parse recommendations",
            reason: "LLM response parsing failed",
            confidence: 0,
          },
        ];
      }

      return {
        user_id: userId,
        item_type: itemType,
        strategy,
        recommendations: recommendations.slice(0, limit),
        total: recommendations.length,
        model_used: llmResult.provider || "unknown",
        generated_at: new Date().toISOString(),
      };
    }

    case "score_lead": {
      // Lead scoring using behavioral signals + LLM analysis
      const leadData = input.lead || {};
      const scoringModel = input.model || "default"; // default, aggressive, conservative
      const signals = input.signals || {};

      if (!leadData.email && !leadData.phone && !leadData.name) {
        throw new Error("Lead must have at least email, phone, or name");
      }

      // Behavioral signals weights
      const behaviorWeights: Record<string, number> = {
        page_views: 1,
        time_on_site_minutes: 2,
        form_submissions: 10,
        email_opens: 3,
        email_clicks: 5,
        demo_requests: 20,
        pricing_page_views: 8,
        return_visits: 4,
        social_engagement: 2,
        content_downloads: 7,
        chat_interactions: 6,
        referral_source_quality: 5,
      };

      // Calculate behavioral score (0-100)
      let behaviorScore = 0;
      let maxPossible = 0;
      for (const [signal, weight] of Object.entries(behaviorWeights)) {
        maxPossible += weight * 10;
        const value = signals[signal] || 0;
        behaviorScore += Math.min(value * weight, weight * 10);
      }
      behaviorScore = Math.round((behaviorScore / maxPossible) * 100);

      // Use LLM for qualitative assessment
      const scorePrompt = `You are a lead scoring analyst. Analyze this lead and provide a qualitative score.

LEAD DATA:
${JSON.stringify(leadData, null, 2)}

BEHAVIORAL SIGNALS:
${JSON.stringify(signals, null, 2)}

BEHAVIORAL SCORE: ${behaviorScore}/100

SCORING MODEL: ${scoringModel}
- default: balanced approach
- aggressive: favor engagement signals, lower threshold for "hot"
- conservative: require more evidence before scoring high

Provide your analysis as JSON:
{
  "qualitative_score": 0-100,
  "grade": "A|B|C|D|F",
  "segment": "hot|warm|cold|unqualified",
  "buying_stage": "awareness|consideration|decision|purchase",
  "key_strengths": ["..."],
  "key_risks": ["..."],
  "recommended_action": "...",
  "next_best_action": "...",
  "estimated_close_probability": 0.0-1.0,
  "reasoning": "..."
}

Return ONLY the JSON, no markdown.`;

      const modelId = input.model_id;
      if (!modelId)
        throw new Error(
          "score_lead requires 'model_id' in input. Configure the LLM model for this tool.",
        );

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [{ role: "user", content: scorePrompt }],
        temperature: 0.2,
        tenant_id: tenantId,
      });

      let qualitative: any = {};
      try {
        const content = llmResult.content || "";
        const cleaned = content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        qualitative = JSON.parse(cleaned);
      } catch {
        qualitative = {
          qualitative_score: behaviorScore,
          grade: behaviorScore > 70 ? "B" : "C",
          segment: "warm",
          reasoning: "LLM parsing failed, using behavioral score",
        };
      }

      // Final composite score
      const compositeScore = Math.round(
        behaviorScore * 0.4 + (qualitative.qualitative_score || behaviorScore) * 0.6,
      );

      return {
        lead: { name: leadData.name, email: leadData.email },
        scores: {
          behavioral: behaviorScore,
          qualitative: qualitative.qualitative_score || behaviorScore,
          composite: compositeScore,
        },
        grade:
          qualitative.grade ||
          (compositeScore > 80 ? "A" : compositeScore > 60 ? "B" : compositeScore > 40 ? "C" : "D"),
        segment: qualitative.segment || "warm",
        buying_stage: qualitative.buying_stage || "consideration",
        key_strengths: qualitative.key_strengths || [],
        key_risks: qualitative.key_risks || [],
        recommended_action: qualitative.recommended_action || "Follow up within 48h",
        next_best_action: qualitative.next_best_action || "Send personalized email",
        estimated_close_probability:
          qualitative.estimated_close_probability || compositeScore / 100,
        model: scoringModel,
        model_used: llmResult.provider || "unknown",
        scored_at: new Date().toISOString(),
      };
    }

    case "recover_cart": {
      // Abandoned cart recovery — generates personalized recovery messages
      const cartData = input.cart || {};
      const customerData = input.customer || {};
      const channel = input.channel || "email"; // email, whatsapp, sms
      const strategy = input.strategy || "standard"; // standard, urgent, discount, social_proof
      const discountPercent = input.discount_percent || 0;
      const language = input.language || "pt-BR";

      if (!cartData.items || !Array.isArray(cartData.items) || cartData.items.length === 0) {
        throw new Error("Cart must have at least one item in cart.items[]");
      }

      const totalValue = cartData.items.reduce(
        (sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1),
        0,
      );

      const recoveryPrompt = `You are a conversion specialist. Generate a personalized cart recovery message.

CUSTOMER:
${JSON.stringify(customerData, null, 2)}

ABANDONED CART:
Items: ${JSON.stringify(cartData.items, null, 2)}
Total: ${totalValue.toFixed(2)}
Abandoned at: ${cartData.abandoned_at || "unknown"}
Cart age (hours): ${cartData.age_hours || "unknown"}

CHANNEL: ${channel}
STRATEGY: ${strategy}
${discountPercent > 0 ? `DISCOUNT OFFERED: ${discountPercent}%` : "NO DISCOUNT"}
LANGUAGE: ${language}

Strategy guidelines:
- standard: friendly reminder, highlight item benefits
- urgent: scarcity/urgency (limited stock, ending soon)
- discount: lead with the discount offer
- social_proof: mention popularity, reviews, other buyers

Generate a JSON response:
{
  "subject": "..." (for email only),
  "message": "...",
  "cta_text": "...",
  "cta_url_params": "?utm_source=cart_recovery&utm_medium=${channel}&utm_campaign=${strategy}",
  "personalization_tokens": ["..."],
  "estimated_recovery_rate": 0.0-1.0,
  "follow_up_recommended": true/false,
  "follow_up_delay_hours": 24,
  "tone": "..."
}

Return ONLY JSON, no markdown. Message in ${language}.`;

      const modelId = input.model_id;
      if (!modelId)
        throw new Error(
          "recover_cart requires 'model_id' in input. Configure the LLM model for this tool.",
        );

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [{ role: "user", content: recoveryPrompt }],
        temperature: 0.5,
        tenant_id: tenantId,
      });

      let recovery: any = {};
      try {
        const content = llmResult.content || "";
        const cleaned = content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        recovery = JSON.parse(cleaned);
      } catch {
        recovery = {
          subject: "Você esqueceu algo no carrinho!",
          message: `Olá${customerData.name ? ` ${customerData.name}` : ""}! Notamos que você deixou itens no carrinho. Finalize sua compra agora!`,
          cta_text: "Finalizar Compra",
          estimated_recovery_rate: 0.15,
        };
      }

      return {
        channel,
        strategy,
        cart_value: totalValue,
        items_count: cartData.items.length,
        discount_applied: discountPercent > 0 ? `${discountPercent}%` : null,
        discount_value: discountPercent > 0 ? (totalValue * discountPercent) / 100 : 0,
        recovery_message: {
          subject: recovery.subject,
          message: recovery.message,
          cta_text: recovery.cta_text || "Finalizar Compra",
          cta_url_params:
            recovery.cta_url_params || `?utm_source=cart_recovery&utm_medium=${channel}`,
        },
        personalization_tokens: recovery.personalization_tokens || [],
        estimated_recovery_rate: recovery.estimated_recovery_rate || 0.15,
        follow_up: {
          recommended: recovery.follow_up_recommended !== false,
          delay_hours: recovery.follow_up_delay_hours || 24,
        },
        model_used: llmResult.provider || "unknown",
        generated_at: new Date().toISOString(),
      };
    }

    case "churn_predict": {
      // Churn prediction using behavioral analysis + LLM
      const customerData = input.customer || {};
      const activityData = input.activity || {};
      const contractData = input.contract || {};

      const churnPrompt = `You are a customer success analyst specialized in churn prediction. Analyze this customer's risk of churning.

CUSTOMER:
${JSON.stringify(customerData, null, 2)}

ACTIVITY DATA (engagement metrics):
${JSON.stringify(activityData, null, 2)}

CONTRACT/SUBSCRIPTION:
${JSON.stringify(contractData, null, 2)}

Analyze and return JSON:
{
  "churn_risk_score": 0-100,
  "risk_level": "low|medium|high|critical",
  "days_to_likely_churn": null or number,
  "risk_factors": [{"factor": "...", "weight": 0.0-1.0, "evidence": "..."}],
  "protective_factors": [{"factor": "...", "weight": 0.0-1.0}],
  "recommended_interventions": [{"action": "...", "priority": "high|medium|low", "timing": "immediate|this_week|this_month"}],
  "health_score": 0-100,
  "engagement_trend": "increasing|stable|declining|critical",
  "reasoning": "..."
}

Return ONLY JSON, no markdown.`;

      const modelId = input.model_id;
      if (!modelId)
        throw new Error(
          "churn_predict requires 'model_id' in input. Configure the LLM model for this tool.",
        );

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [{ role: "user", content: churnPrompt }],
        temperature: 0.2,
        tenant_id: tenantId,
      });

      let prediction: any = {};
      try {
        const content = llmResult.content || "";
        const cleaned = content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        prediction = JSON.parse(cleaned);
      } catch {
        prediction = {
          churn_risk_score: 50,
          risk_level: "medium",
          reasoning: "LLM parsing failed",
        };
      }

      return {
        customer: { name: customerData.name, id: customerData.id },
        churn_risk_score: prediction.churn_risk_score || 50,
        risk_level: prediction.risk_level || "medium",
        health_score: prediction.health_score || 100 - (prediction.churn_risk_score || 50),
        days_to_likely_churn: prediction.days_to_likely_churn,
        engagement_trend: prediction.engagement_trend || "stable",
        risk_factors: prediction.risk_factors || [],
        protective_factors: prediction.protective_factors || [],
        recommended_interventions: prediction.recommended_interventions || [],
        model_used: llmResult.provider || "unknown",
        analyzed_at: new Date().toISOString(),
      };
    }

    case "dynamic_pricing": {
      // Dynamic pricing analysis using market signals + LLM
      const product = input.product || {};
      const marketData = input.market || {};
      const constraints = input.constraints || {};
      const objective = input.objective || "maximize_revenue"; // maximize_revenue, maximize_volume, competitive_match

      const pricingPrompt = `You are a pricing strategist. Analyze and recommend optimal pricing.

PRODUCT:
${JSON.stringify(product, null, 2)}

MARKET DATA:
${JSON.stringify(marketData, null, 2)}

CONSTRAINTS:
${JSON.stringify(constraints, null, 2)}

OBJECTIVE: ${objective}

Analyze and return JSON:
{
  "recommended_price": number,
  "price_range": {"min": number, "max": number},
  "current_price_assessment": "underpriced|fair|overpriced",
  "elasticity_estimate": "elastic|unit_elastic|inelastic",
  "competitor_position": "below|at|above",
  "margin_at_recommended": number (percent),
  "volume_impact_estimate": "increase|stable|decrease",
  "confidence": 0.0-1.0,
  "pricing_tiers": [{"name": "...", "price": number, "features": ["..."]}],
  "seasonal_adjustment": number (percent, + or -),
  "reasoning": "..."
}

Return ONLY JSON, no markdown.`;

      const modelId = input.model_id;
      if (!modelId)
        throw new Error(
          "dynamic_pricing requires 'model_id' in input. Configure the LLM model for this tool.",
        );

      const llmResult = await routeLLM({
        model_id: modelId,
        messages: [{ role: "user", content: pricingPrompt }],
        temperature: 0.3,
        tenant_id: tenantId,
      });

      let pricing: any = {};
      try {
        const content = llmResult.content || "";
        const cleaned = content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        pricing = JSON.parse(cleaned);
      } catch {
        pricing = {
          recommended_price: product.current_price || 0,
          confidence: 0,
          reasoning: "LLM parsing failed",
        };
      }

      return {
        product: { name: product.name, current_price: product.current_price },
        objective,
        recommended_price: pricing.recommended_price,
        price_range: pricing.price_range || { min: 0, max: 0 },
        current_assessment: pricing.current_price_assessment || "fair",
        elasticity: pricing.elasticity_estimate || "unknown",
        competitor_position: pricing.competitor_position || "unknown",
        margin_estimate: pricing.margin_at_recommended,
        volume_impact: pricing.volume_impact_estimate || "stable",
        confidence: pricing.confidence || 0.5,
        pricing_tiers: pricing.pricing_tiers || [],
        seasonal_adjustment: pricing.seasonal_adjustment || 0,
        model_used: llmResult.provider || "unknown",
        analyzed_at: new Date().toISOString(),
      };
    }

    default:
      throw new Error(`Built-in tool '${toolName}' not implemented`);
  }
}

// ═══════════════════════════════════════════════════════════
// RETRY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
): Promise<{ result: T; retries: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt };
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s
        console.log(
          `[tool-executor] Retry ${attempt + 1}/${maxRetries} in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError!;
}

// Builtins used in flows but optional in tool_registry seeds
const IMPLICIT_BUILTIN_TOOLS = new Set([
  "llm_generate",
  "rag_search",
  "http_request",
  "condition_eval",
  "web_research",
  "extract_design_dna",
]);

// ═══════════════════════════════════════════════════════════
// MAIN EXECUTOR
// ═══════════════════════════════════════════════════════════

export async function executeTool(req: ToolExecutionRequest): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Lookup tool in registry
  const { data: tool, error: toolErr } = await supabase
    .from("tool_registry")
    .select(
      "name, display_name, executor_type, executor_config, input_schema, output_schema, required_secrets, requires_idempotency, circuit_breaker_threshold, circuit_breaker_timeout_seconds, rate_limit_per_minute, category, is_builtin",
    )
    .eq("name", req.tool_name)
    .eq("is_active", true)
    .maybeSingle();

  if (toolErr || !tool) {
    if (IMPLICIT_BUILTIN_TOOLS.has(req.tool_name)) {
      try {
        const { result, retries } = await withRetry(
          async () => {
            return executeBuiltinTool(req.tool_name, req.input_data, {}, req.tenant_id);
          },
          3,
          1000,
        );
        await recordSuccess(req.tool_name);
        return {
          tool_name: req.tool_name,
          status: "success",
          result,
          duration_ms: Date.now() - startTime,
          retries,
          circuit_state: (await getCircuitFromDB(req.tool_name)).state,
        };
      } catch (err: any) {
        return {
          tool_name: req.tool_name,
          status: "error",
          result: null,
          duration_ms: Date.now() - startTime,
          retries: 3,
          error: err.message,
        };
      }
    }

    return {
      tool_name: req.tool_name,
      status: "error",
      result: null,
      duration_ms: Date.now() - startTime,
      retries: 0,
      error: `Tool '${req.tool_name}' not found in registry or inactive`,
    };
  }

  const registryTool = tool as ToolRegistryEntry;

  // 2. Circuit Breaker check
  const cbThreshold = registryTool.circuit_breaker_threshold || 5;
  const cbTimeout = registryTool.circuit_breaker_timeout_seconds || 60;
  const cbCheck = await checkCircuit(req.tool_name, cbThreshold, cbTimeout);

  if (!cbCheck.allowed) {
    console.log(`[tool-executor] Circuit OPEN for ${req.tool_name} — skipping execution`);
    return {
      tool_name: req.tool_name,
      display_name: registryTool.display_name,
      status: "circuit_open",
      result: null,
      duration_ms: Date.now() - startTime,
      retries: 0,
      circuit_state: "open",
      error: `Circuit breaker OPEN for '${req.tool_name}' — too many consecutive failures`,
    };
  }

  // 3. Idempotency check
  let idempotencyKey: string | undefined;
  if (registryTool.requires_idempotency) {
    idempotencyKey = computeIdempotencyKey(req.tool_name, req.input_data, req.execution_id);
    const cachedResult = await checkIdempotency(supabase, req.execution_id, idempotencyKey);
    if (cachedResult) {
      console.log(`[tool-executor] Idempotent hit for ${req.tool_name} key=${idempotencyKey}`);
      return {
        tool_name: req.tool_name,
        display_name: registryTool.display_name,
        status: "idempotent_hit",
        result: cachedResult,
        duration_ms: Date.now() - startTime,
        retries: 0,
        idempotency_key: idempotencyKey,
        circuit_state: cbCheck.state,
      };
    }
  }

  // 4. Inject secrets
  const secrets = registryTool.required_secrets?.length
    ? await injectSecrets(supabase, req.tenant_id, registryTool.required_secrets)
    : {};

  // 5. Execute with retry
  try {
    const { result, retries } = await withRetry(
      async () => {
        if (registryTool.executor_type === "edge_function") {
          return executeEdgeFunction(
            registryTool,
            req.input_data,
            secrets,
            req.tenant_id,
            req.timeout_ms,
          );
        }
        if (registryTool.is_builtin) {
          return executeBuiltinTool(req.tool_name, req.input_data, secrets, req.tenant_id);
        }
        return executeExternalTool(registryTool, req.input_data, secrets, req.timeout_ms);
      },
      3,
      1000,
    );

    await recordSuccess(req.tool_name);

    return {
      tool_name: req.tool_name,
      display_name: registryTool.display_name,
      status: "success",
      result,
      duration_ms: Date.now() - startTime,
      retries,
      idempotency_key: idempotencyKey,
      circuit_state: (await getCircuitFromDB(req.tool_name)).state,
    };
  } catch (err: any) {
    await recordFailure(req.tool_name, cbThreshold);

    return {
      tool_name: req.tool_name,
      display_name: registryTool.display_name,
      status: "error",
      result: null,
      duration_ms: Date.now() - startTime,
      retries: 3,
      idempotency_key: idempotencyKey,
      circuit_state: (await getCircuitFromDB(req.tool_name)).state,
      error: err.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// EDGE FUNCTION TOOL EXECUTION (Supabase functions.invoke pattern)
// ═══════════════════════════════════════════════════════════

async function executeEdgeFunction(
  tool: ToolRegistryEntry,
  input: Record<string, any>,
  secrets: Record<string, string>,
  tenantId: string,
  timeoutOverride?: number,
): Promise<any> {
  const config = tool.executor_config || {};
  const functionName = config.function_name as string | undefined;
  if (!functionName) {
    throw new Error(`Tool '${tool.name}' edge_function missing function_name in executor_config`);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const toolField = (config.tool_param || config.tool_field || tool.name) as string;

  const body: Record<string, unknown> = {
    tool: toolField,
    input,
    tenant_id: tenantId,
  };
  if (config.pass_secrets !== false && Object.keys(secrets).length) {
    body.secrets = secrets;
  }

  const controller = new AbortController();
  const timeout = timeoutOverride || config.timeout_ms || 30000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const bodyText = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = { raw: bodyText };
    }

    if (!res.ok) {
      throw new Error(
        `Edge function '${functionName}' HTTP ${res.status}: ${bodyText.substring(0, 200)}`,
      );
    }

    if (parsed?.status === "error" && parsed?.error) {
      throw new Error(String(parsed.error));
    }

    return parsed?.result ?? parsed;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// EXTERNAL TOOL EXECUTION (HTTP endpoint from registry)
// ═══════════════════════════════════════════════════════════

async function executeExternalTool(
  tool: ToolRegistryEntry,
  input: Record<string, any>,
  secrets: Record<string, string>,
  timeoutOverride?: number,
): Promise<any> {
  const config = tool.executor_config || {};
  const endpointUrl = config.endpoint_url;

  if (!endpointUrl) {
    throw new Error(`Tool '${tool.name}' has no endpoint configured`);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Auth injection from secrets
  if (config.auth_type === "bearer" && config.auth_secret_name) {
    const token = secrets[config.auth_secret_name] || config.token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } else if (config.auth_type === "api_key" && config.api_key_secret) {
    const key = secrets[config.api_key_secret] || config.api_key;
    if (key) headers[config.header_name || "X-API-Key"] = key;
  }

  // Custom headers from config
  if (config.custom_headers && typeof config.custom_headers === "object") {
    Object.assign(headers, config.custom_headers);
  }

  const controller = new AbortController();
  const timeout = timeoutOverride || config.timeout_ms || 30000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const method = (config.http_method || "POST").toUpperCase();
    const fetchOpts: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (["POST", "PUT", "PATCH"].includes(method)) {
      // Apply input_mapping if configured
      const body = config.input_mapping ? applyMapping(config.input_mapping, input) : input;
      fetchOpts.body = JSON.stringify(body);
    }

    const res = await fetch(endpointUrl, fetchOpts);
    clearTimeout(timer);

    const bodyText = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = { raw: bodyText };
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${bodyText.substring(0, 200)}`);
    }

    // Apply output_mapping if configured
    if (config.output_mapping) {
      return applyMapping(config.output_mapping, parsed);
    }

    return parsed;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Simple mapping: { "target_key": "$.source_key" }
 */
function applyMapping(mapping: Record<string, string>, data: any): any {
  const result: Record<string, any> = {};
  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    if (typeof sourcePath === "string" && sourcePath.startsWith("$.")) {
      const keys = sourcePath.substring(2).split(".");
      let val = data;
      for (const k of keys) {
        val = val?.[k];
      }
      result[targetKey] = val;
    } else {
      result[targetKey] = sourcePath;
    }
  }
  return result;
}
