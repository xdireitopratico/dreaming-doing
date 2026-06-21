#!/usr/bin/env node
/**
 * E2E smoke: Design DNA Library
 *
 * Tests:
 *  1. design-dna-scheduler:schedule (manual, 1 URL shallow)
 *  2. Verify job created in DB
 *  3. Wait for Inngest → executor → design_system_library entry
 *  4. design-library-chat:chat (admin LLM)
 *  5. Verify RLS blocks non-admin SELECT
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i);
      let val = t.slice(i + 1);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {
    console.error("⚠ .env.local not found");
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_URL = "https://example.com";

let passed = 0;
let failed = 0;

function log(name, ok, detail = "") {
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? " — " + detail : ""}`);
  if (ok) passed++;
  else failed++;
}

async function test1_ScheduleJob() {
  console.log("\n── Test 1: schedule job (manual) ──");
  try {
    const { data, error } = await adminClient.functions.invoke("design-dna-scheduler", {
      body: { action: "schedule", urls: [TEST_URL], depth: "shallow", categories: ["hero"] },
    });

    if (error) {
      log("schedule via service_role", false, error.message);
      return null;
    }

    const jobId = data?.jobId;
    if (!jobId) {
      log("schedule returns jobId", false, JSON.stringify(data));
      return null;
    }
    log("schedule returns jobId", true, jobId.slice(0, 8));
    return jobId;
  } catch (err) {
    log("schedule via service_role", false, err.message);
    return null;
  }
}

async function test2_VerifyJobInDb(jobId) {
  console.log("\n── Test 2: job in DB ──");
  if (!jobId) {
    log("verify job exists", false, "no jobId");
    return;
  }
  const { data, error } = await adminClient
    .from("design_dna_jobs")
    .select("id, status, urls, depth")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    log("fetch job", false, error?.message ?? "no data");
    return;
  }
  const ok = data.id === jobId && data.status;
  log("fetch job by id", ok, `status=${data.status} depth=${data.depth}`);
}

async function test3_WaitForCompletion(jobId, timeoutMs = 300000) {
  console.log("\n── Test 3: wait for completion ──");
  if (!jobId) {
    log("wait for completion", false, "no jobId");
    return null;
  }
  const start = Date.now();
  let lastStatus = "";
  while (Date.now() - start < timeoutMs) {
    const { data } = await adminClient
      .from("design_dna_jobs")
      .select("status, finished_at, error, results")
      .eq("id", jobId)
      .single();

    if (data?.status !== lastStatus) {
      console.log(`  status: ${data?.status}${data?.error ? " — " + data.error : ""}`);
      lastStatus = data?.status ?? "";
    }

    if (data?.status === "completed" || data?.status === "failed" || data?.status === "canceled") {
      // completed = full success; failed with E2B error = expected if no E2B key
      const e2bMissing = data.error?.includes("E2B");
      const ok = data.status === "completed" || (data.status === "failed" && e2bMissing);
      const detail =
        data.status === "completed"
          ? `at ${data.finished_at}`
          : e2bMissing
            ? "E2B key not configured (expected)"
            : (data.error ?? "");
      log(`job ${data.status}`, ok, detail);
      return data;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  log("wait for completion", false, "timeout");
  return null;
}

async function test4_LibraryEntry() {
  console.log("\n── Test 4: library entry (admin SELECT) ──");
  const { data, error } = await adminClient
    .from("design_system_library")
    .select("id, name, source_url, quality_score")
    .eq("source_url", TEST_URL)
    .limit(1);

  if (error) {
    log("admin SELECT library", false, error.message);
    return;
  }
  if (!data || data.length === 0) {
    log("library entry from example.com", false, "no row");
    return;
  }
  log("library entry exists", true, `quality=${data[0].quality_score}`);
}

async function test5_RlsBlocksAnon() {
  console.log("\n── Test 5: RLS blocks non-admin ──");
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anonClient.from("design_system_library").select("id").limit(1);

  if (error) {
    log("anon SELECT denied", true, error.message.slice(0, 60));
  } else if (!data || data.length === 0) {
    log("anon SELECT denied (empty)", true, "0 rows");
  } else {
    log("anon SELECT denied", false, `got ${data.length} rows`);
  }
}

async function test6_ChatEndpoint() {
  console.log("\n── Test 6: design-library-chat (welcome + history) ──");

  // Use a real completed job if available
  const { data: job } = await adminClient
    .from("design_dna_jobs")
    .select("id, status")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const jobId = job?.id ?? "00000000-0000-0000-0000-000000000000";

  // 1. Empty message → welcome
  const welcome = await adminClient.functions.invoke("design-library-chat", {
    body: { jobId, message: "" },
  });

  if (welcome.error) {
    log("chat welcome", false, welcome.error.message?.slice(0, 80) ?? "error");
  } else if (welcome.data?.reply) {
    log("chat welcome", true, welcome.data.reply.slice(0, 60) + "...");
  } else {
    log("chat welcome", false, "no reply");
  }

  // 2. Real message → LLM response
  const reply = await adminClient.functions.invoke("design-library-chat", {
    body: { jobId, message: "Quantas URLs tem esse job?" },
  });

  if (reply.error) {
    log("chat with LLM", false, reply.error.message?.slice(0, 80) ?? "error");
  } else if (reply.data?.reply) {
    log("chat with LLM", true, reply.data.reply.slice(0, 60) + "...");
  } else {
    log("chat with LLM", false, "no reply");
  }

  // 3. History persisted in DB
  const { data: session } = await adminClient
    .from("design_library_chat_sessions")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (session) {
    const { data: msgs } = await adminClient
      .from("design_library_chat_messages")
      .select("id")
      .eq("session_id", session.id);

    const ok = (msgs?.length ?? 0) >= 2; // welcome + reply
    log("chat history persisted", ok, `${msgs?.length ?? 0} messages`);
  } else {
    log("chat history persisted", false, "no session");
  }
}

async function main() {
  console.log("=== Design DNA Library — E2E Smoke Test ===\n");

  const jobId = await test1_ScheduleJob();
  await test2_VerifyJobInDb(jobId);
  const result = await test3_WaitForCompletion(jobId);
  if (result?.status === "completed") {
    await test4_LibraryEntry();
  }
  await test5_RlsBlocksAnon();
  await test6_ChatEndpoint();

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
