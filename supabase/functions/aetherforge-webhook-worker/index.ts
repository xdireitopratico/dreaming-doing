/**
 * AetherForge Webhook Worker
 * Receives external webhooks, stores in webhook_inbox with dedup + HMAC,
 * and triggers the associated flow via gateway.
 *
 * BUG FIXES: 27 (timing-safe HMAC), 28 (empty sig bypass), 29 (flow_id→slug), 58 (strip sensitive headers)
 * Max: 160 lines | ADR-022
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-flow-id, x-webhook-secret, x-dedup-key",
};

// BUG 27 FIX: Use crypto.subtle for timing-safe HMAC comparison
async function hmacVerify(secret: string, signature: string, body: string): Promise<boolean> {
  try {
    if (!signature || !secret) return false; // BUG 28 FIX: empty signature = fail
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    // Compute expected signature
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expected = new Uint8Array(sig);

    // Parse provided signature (strip "sha256=" prefix)
    const providedHex = signature.replace("sha256=", "");
    const providedBytes = new Uint8Array(providedHex.length / 2);
    for (let i = 0; i < providedHex.length; i += 2) {
      providedBytes[i / 2] = parseInt(providedHex.substring(i, i + 2), 16);
    }

    // Length check first
    if (expected.length !== providedBytes.length) return false;

    // Timing-safe comparison via subtle crypto verify
    // Alternatively, constant-time byte compare:
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected[i] ^ providedBytes[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

// BUG 58 FIX: Strip sensitive headers before persisting
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-webhook-secret",
  "x-api-key",
]);

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of headers.entries()) {
    if (!SENSITIVE_HEADERS.has(k.toLowerCase()) && !k.toLowerCase().startsWith("x-webhook")) {
      result[k] = v;
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const flowId = req.headers.get("x-flow-id");
    const signature =
      req.headers.get("x-webhook-secret") || req.headers.get("x-hub-signature-256") || "";
    const dedupKey = req.headers.get("x-dedup-key") || "";
    const rawBody = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { raw: rawBody };
    }

    const source = req.headers.get("user-agent")?.split("/")[0] || "unknown";

    // 1. Dedup check
    if (dedupKey) {
      const { data: existing } = await supabase
        .from("webhook_inbox")
        .select("id")
        .eq("dedup_key", dedupKey)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ status: "duplicate", id: existing.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. HMAC verification — BUG 28 FIX: Require valid sig if secret exists
    let signatureVerified = false;
    if (flowId) {
      const { data: flow } = await supabase
        .from("agent_flows")
        .select("user_id")
        .eq("id", flowId)
        .maybeSingle();
      if (flow?.user_id) {
        const { data: sec } = await supabase
          .from("tenant_secrets")
          .select("secret_value")
          .eq("user_id", flow.user_id)
          .eq("secret_name", "WEBHOOK_SECRET")
          .maybeSingle();
        if (sec?.secret_value) {
          // If secret is configured, signature MUST be present and valid
          if (!signature) {
            return new Response(JSON.stringify({ error: "Signature required" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          signatureVerified = await hmacVerify(sec.secret_value, signature, rawBody);
          if (!signatureVerified) {
            return new Response(JSON.stringify({ error: "Invalid signature" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    // 3. Store in webhook_inbox
    const { data: webhook, error: insertErr } = await supabase
      .from("webhook_inbox")
      .insert({
        source,
        body,
        headers: sanitizeHeaders(req.headers),
        dedup_key: dedupKey || null,
        signature: signature ? "[redacted]" : null, // Don't persist raw signature
        signature_verified: signatureVerified,
        status: flowId ? "processing" : "pending",
        external_id: flowId || null,
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    // 4. If flow_id provided, resolve slug and trigger execution
    if (flowId) {
      // BUG 29 FIX: Resolve slug from deployment, since gateway expects slug not flow_id
      const { data: deployment } = await supabase
        .from("agent_deployments")
        .select("endpoint_slug")
        .eq("flow_id", flowId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!deployment?.endpoint_slug) {
        await supabase
          .from("webhook_inbox")
          .update({ status: "failed", error_message: "No active deployment for flow" })
          .eq("id", webhook.id);
        return new Response(
          JSON.stringify({
            status: "failed",
            webhook_id: webhook.id,
            error: "No active deployment",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const gatewayUrl = `${supabaseUrl}/functions/v1/aetherforge-gateway`;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          slug: deployment.endpoint_slug, // BUG 29 FIX: send slug, not flow_id
          message: JSON.stringify(body),
          channel: "webhook",
          metadata: { webhook_id: webhook.id, source, dedup_key: dedupKey },
        }),
      });

      let result;
      try {
        result = await res.json();
      } catch {
        result = { error: "Invalid gateway response" };
      }

      await supabase
        .from("webhook_inbox")
        .update({
          status: res.ok ? "processed" : "failed",
          processed_at: new Date().toISOString(),
          error_message: res.ok ? null : result.error || "Gateway error",
        })
        .eq("id", webhook.id);

      return new Response(
        JSON.stringify({
          status: res.ok ? "processed" : "failed",
          webhook_id: webhook.id,
          execution: result,
        }),
        {
          status: res.ok ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ status: "pending", webhook_id: webhook.id }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[WebhookWorker] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
