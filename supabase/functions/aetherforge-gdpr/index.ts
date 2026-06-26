/**
 * aetherforge-gdpr — LGPD/GDPR compliance: data export + deletion
 *
 * BUG FIXES: 34 (cooling-off), 35 (batch delete), 36 (scoped exec steps), 37 (missing tables), 63 (export pagination), 64 (conditional flow delete), 76 (ternary fix)
 * R54: Max 250 lines
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// BUG 37 FIX: Include all user data tables
const AGENT_TABLES = [
  "agent_execution_steps",
  "agent_executions",
  "agent_flow_comments",
  "agent_flow_members",
  "agent_flow_versions",
  "agent_marketplace_ratings",
  "agent_marketplace_purchases",
  "agent_marketplace_listings",
  "agent_deployments",
  "agent_test_suites",
  "agent_schedules",
  "agent_notifications",
  "agent_alert_rules",
  "agent_flow_nodes",
  "tenant_secrets", // BUG 37 FIX
  "rag_chunks", // BUG 37 FIX
  "rag_documents", // BUG 37 FIX
  "webhook_inbox", // BUG 37 FIX
  "agent_flows",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // BUG 34 FIX: Only accept POST for destructive actions
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "export") {
      return await handleExport(supabase, user.id);
    } else if (action === "delete") {
      // BUG 34 FIX: Require explicit confirmation token
      if (body.confirm !== "DELETE_ALL_MY_DATA") {
        return new Response(
          JSON.stringify({
            error:
              "Deletion requires confirmation. Send { action: 'delete', confirm: 'DELETE_ALL_MY_DATA' }",
            cooling_off: "This action is irreversible. Please confirm.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return await handleDelete(supabase, user.id, user.email || "unknown");
    } else if (action === "summary") {
      return await handleSummary(supabase, user.id);
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use: export, delete, summary" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (err: any) {
    console.error("[aetherforge-gdpr] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleSummary(supabase: any, userId: string): Promise<Response> {
  const counts: Record<string, number> = {};
  for (const table of [
    "agent_flows",
    "agent_executions",
    "agent_deployments",
    "agent_marketplace_listings",
  ]) {
    // BUG 76 FIX: Correct column per table
    const col = table === "agent_marketplace_listings" ? "publisher_id" : "user_id";
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(col, userId);
    counts[table] = count || 0;
  }
  return new Response(JSON.stringify({ user_id: userId, data_summary: counts }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleExport(supabase: any, userId: string): Promise<Response> {
  const exportData: Record<string, any[]> = {};

  const { data: flows, error: flowsErr } = await supabase
    .from("agent_flows")
    .select("*")
    .eq("user_id", userId);
  if (flowsErr) console.error("[aetherforge-gdpr] export flows fetch failed:", flowsErr.message);
  exportData.agent_flows = flows || [];
  const flowIds = (flows || []).map((f: any) => f.id);

  if (flowIds.length > 0) {
    for (const table of [
      "agent_flow_nodes",
      "agent_flow_versions",
      "agent_deployments",
      "agent_executions",
      "agent_test_suites",
      "agent_schedules",
      "agent_marketplace_listings",
    ]) {
      const col = table === "agent_marketplace_listings" ? "flow_id" : "flow_id";
      // BUG 63 FIX: Paginate export to avoid truncation
      let allData: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from(table)
          .select("*")
          .in(col, flowIds)
          .range(offset, offset + pageSize - 1);
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      exportData[table] = allData;
    }

    // BUG 36 FIX: Only export steps for user's own executions
    const execIds = (exportData.agent_executions || []).map((e: any) => e.id);
    if (execIds.length > 0) {
      let allSteps: any[] = [];
      let offset = 0;
      while (true) {
        const { data: steps } = await supabase
          .from("agent_execution_steps")
          .select("*")
          .in("execution_id", execIds)
          .range(offset, offset + 999);
        if (!steps || steps.length === 0) break;
        allSteps = allSteps.concat(steps);
        if (steps.length < 1000) break;
        offset += 1000;
      }
      exportData.agent_execution_steps = allSteps;
    }

    // BUG 37 FIX: Export RAG data and tenant_secrets (masked)
    const { data: ragDocs, error: ragErr } = await supabase
      .from("rag_documents")
      .select("*")
      .in("flow_id", flowIds);
    if (ragErr)
      console.error("[aetherforge-gdpr] export rag_documents fetch failed:", ragErr.message);
    exportData.rag_documents = ragDocs || [];

    const { data: secrets, error: secretsErr } = await supabase
      .from("tenant_secrets")
      .select("id, secret_name, created_at")
      .eq("user_id", userId);
    if (secretsErr)
      console.error("[aetherforge-gdpr] export tenant_secrets fetch failed:", secretsErr.message);
    exportData.tenant_secrets = (secrets || []).map((s: any) => ({
      ...s,
      secret_value: "[REDACTED]",
    }));
  }

  const { data: notifications, error: notifErr } = await supabase
    .from("agent_notifications")
    .select("*")
    .eq("user_id", userId);
  if (notifErr)
    console.error("[aetherforge-gdpr] export notifications fetch failed:", notifErr.message);
  exportData.agent_notifications = notifications || [];

  return new Response(
    JSON.stringify({
      exported_at: new Date().toISOString(),
      user_id: userId,
      tables: Object.keys(exportData),
      total_records: Object.values(exportData).reduce((s, arr) => s + arr.length, 0),
      data: exportData,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="aetherforge-export.json"`,
      },
    },
  );
}

// BUG 35 FIX: Delete with error checking on each operation
async function handleDelete(supabase: any, userId: string, email: string): Promise<Response> {
  const deletedTables: string[] = [];
  const errors: string[] = [];

  const { data: flows, error: flowsErr } = await supabase
    .from("agent_flows")
    .select("id")
    .eq("user_id", userId);
  if (flowsErr) errors.push(`agent_flows fetch: ${flowsErr.message}`);
  const flowIds = (flows || []).map((f: any) => f.id);

  if (flowIds.length > 0) {
    // BUG 36 FIX: Get execution IDs scoped to user's flows only
    const { data: userExecs, error: execsErr } = await supabase
      .from("agent_executions")
      .select("id")
      .in("flow_id", flowIds);
    if (execsErr) errors.push(`agent_executions fetch: ${execsErr.message}`);
    const userExecIds = (userExecs || []).map((e: any) => e.id);

    // Delete execution steps only for user's executions (BUG 36 FIX)
    if (userExecIds.length > 0) {
      const { error } = await supabase
        .from("agent_execution_steps")
        .delete()
        .in("execution_id", userExecIds);
      if (error) errors.push(`agent_execution_steps: ${error.message}`);
      else deletedTables.push("agent_execution_steps");
    }

    // BUG 37 FIX: Delete RAG data
    const { data: ragDocs, error: ragFetchErr } = await supabase
      .from("rag_documents")
      .select("id")
      .in("flow_id", flowIds);
    if (ragFetchErr) errors.push(`rag_documents fetch: ${ragFetchErr.message}`);
    const ragDocIds = (ragDocs || []).map((d: any) => d.id);
    if (ragDocIds.length > 0) {
      const { error: chunkDelErr } = await supabase
        .from("rag_chunks")
        .delete()
        .in("document_id", ragDocIds);
      if (chunkDelErr) errors.push(`rag_chunks: ${chunkDelErr.message}`);
      else deletedTables.push("rag_chunks");
    }
    if (ragDocs?.length) {
      const { error: ragDelErr } = await supabase
        .from("rag_documents")
        .delete()
        .in("flow_id", flowIds);
      if (ragDelErr) errors.push(`rag_documents: ${ragDelErr.message}`);
      else deletedTables.push("rag_documents");
    }

    // Delete other flow-scoped tables
    const flowTables = [
      "agent_executions",
      "agent_flow_nodes",
      "agent_flow_versions",
      "agent_flow_comments",
      "agent_flow_members",
      "agent_deployments",
      "agent_test_suites",
      "agent_schedules",
      "agent_alert_rules",
    ];

    for (const table of flowTables) {
      const { error } = await supabase.from(table).delete().in("flow_id", flowIds);
      if (error) errors.push(`${table}: ${error.message}`);
      else deletedTables.push(table);
    }

    // Marketplace
    const { data: listings, error: listFetchErr } = await supabase
      .from("agent_marketplace_listings")
      .select("id")
      .in("flow_id", flowIds);
    if (listFetchErr) errors.push(`agent_marketplace_listings fetch: ${listFetchErr.message}`);
    const listingIds = (listings || []).map((l: any) => l.id);
    if (listingIds.length > 0) {
      const { error: ratingsErr } = await supabase
        .from("agent_marketplace_ratings")
        .delete()
        .in("listing_id", listingIds);
      if (ratingsErr) errors.push(`agent_marketplace_ratings: ${ratingsErr.message}`);
      else deletedTables.push("agent_marketplace_ratings");
      const { error: purchErr } = await supabase
        .from("agent_marketplace_purchases")
        .delete()
        .in("listing_id", listingIds);
      if (purchErr) errors.push(`agent_marketplace_purchases: ${purchErr.message}`);
      else deletedTables.push("agent_marketplace_purchases");
    }
    const { error: listDelErr } = await supabase
      .from("agent_marketplace_listings")
      .delete()
      .in("flow_id", flowIds);
    if (listDelErr) errors.push(`agent_marketplace_listings: ${listDelErr.message}`);
    else deletedTables.push("agent_marketplace_listings");
  }

  // BUG 64 FIX: Only delete flows if user owns them (already filtered by user_id)
  const { error: flowDelErr } = await supabase.from("agent_flows").delete().eq("user_id", userId);
  if (flowDelErr) errors.push(`agent_flows: ${flowDelErr.message}`);
  else deletedTables.push("agent_flows");

  // User-scoped tables
  const { error: notifDelErr } = await supabase
    .from("agent_notifications")
    .delete()
    .eq("user_id", userId);
  if (notifDelErr) errors.push(`agent_notifications: ${notifDelErr.message}`);
  else deletedTables.push("agent_notifications");

  // BUG 37 FIX: Delete tenant secrets
  const { error: secDelErr } = await supabase.from("tenant_secrets").delete().eq("user_id", userId);
  if (secDelErr) errors.push(`tenant_secrets: ${secDelErr.message}`);
  else deletedTables.push("tenant_secrets");

  // BUG 37 FIX: Delete webhook_inbox (via external_id matching flow_ids)
  // Note: webhook_inbox doesn't have user_id, best effort via external_id
  if (flowIds.length > 0) {
    const { error: whDelErr } = await supabase
      .from("webhook_inbox")
      .delete()
      .in("external_id", flowIds);
    if (whDelErr) errors.push(`webhook_inbox: ${whDelErr.message}`);
    else deletedTables.push("webhook_inbox");
  }

  console.log(
    `[GDPR] Data deletion completed for user ${userId}. Tables: ${deletedTables.join(", ")}`,
  );

  return new Response(
    JSON.stringify({
      deleted_at: new Date().toISOString(),
      user_id: userId,
      tables_cleared: deletedTables,
      errors: errors.length > 0 ? errors : undefined,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
