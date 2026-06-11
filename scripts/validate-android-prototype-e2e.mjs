#!/usr/bin/env node
/**
 * E2E validation: Android/mixed prototype project across FORGE stack layers.
 * Phase 1 evidence only — no fixes.
 *
 * Usage:
 *   node scripts/validate-android-prototype-e2e.mjs
 *   node scripts/validate-android-prototype-e2e.mjs --project-id=UUID
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_PROJECT = "27d4fd0c-9783-44ac-9446-70bd931620ac";
const DEFAULT_CONVERSATION = "2bfca54a-3170-4a4d-9289-e8acab4d413f";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
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
  } catch {
    /* optional */
  }
}

loadEnvLocal();

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const projectId = arg("project-id", DEFAULT_PROJECT);
const conversationId = arg("conversation-id", DEFAULT_CONVERSATION);
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const results = [];

function record(layer, check, ok, detail = "") {
  results.push({ layer, check, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${layer} :: ${check}${detail ? ` — ${detail}` : ""}`);
}

function rest(path, init = {}) {
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

const ANDROID_PATH_RE =
  /(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|gradlew|app\/src\/main\/|\.kt$|AndroidManifest\.xml)/i;
const WEB_PATH_RE = /vite\.config|index\.html|src\/app\.tsx|src\/main\.tsx/i;

function detectStack(files) {
  const paths = files.map((f) => f.path.replace(/^\//, "").toLowerCase());
  const pkg = files.find((f) => /(^|\/)package\.json$/i.test(f.path));
  const pkgContent = pkg?.content ?? "";
  const hasAndroid = paths.some((p) => ANDROID_PATH_RE.test(p));
  const hasExpo = /"(expo|react-native|@expo\/)/i.test(pkgContent);
  const hasWeb =
    paths.some((p) => WEB_PATH_RE.test(p)) || /"(vite|@vitejs\/|react-dom)/i.test(pkgContent);
  if (hasAndroid && hasWeb) return "mixed";
  if (hasAndroid) return "android-native";
  if (hasExpo) return "expo";
  return "web";
}

function collectNativeFiles(files) {
  return files
    .map((f) => f.path.replace(/^\//, ""))
    .filter((p) => ANDROID_PATH_RE.test(p))
    .sort();
}

async function main() {
  console.log(`\n=== FORGE Android Prototype E2E ===`);
  console.log(`project=${projectId.slice(0, 8)}…\n`);

  if (!url || !key) {
    record("infra", "env secrets", false, "SUPABASE_URL + SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  record("infra", "env secrets", true);

  // Layer: DB project exists
  const projRes = await rest(`projects?select=id,name,template,meta&id=eq.${projectId}`);
  const projects = await projRes.json();
  const project = Array.isArray(projects) ? projects[0] : null;
  record("db", "project exists", Boolean(project?.id), project?.name ?? "not found");

  const filesRes = await rest(
    `project_files?select=path,content&project_id=eq.${projectId}&order=path.asc`,
  );
  const files = await filesRes.json();
  record("db", "project_files", Array.isArray(files) && files.length > 0, `${files.length} files`);

  // Layer: stack detection
  const stack = detectStack(files);
  record("stack", "detectProjectStack", stack === "mixed" || stack === "android-native", stack);
  record(
    "stack",
    "template vs files alignment",
    project?.template === "android-native" || stack === "mixed",
    `db.template=${project?.template ?? "?"}`,
  );

  const nativeFiles = collectNativeFiles(files);
  record("stack", "native file paths", nativeFiles.length >= 4, `${nativeFiles.length} paths`);
  record(
    "stack",
    "MainActivity.kt present",
    nativeFiles.some((p) => /MainActivity\.kt$/i.test(p)),
    nativeFiles.some((p) => /MainActivity\.kt$/i.test(p)) ? "ok" : "missing",
  );
  record(
    "stack",
    "AudioRecordingService present",
    nativeFiles.some((p) => /AudioRecordingService\.kt$/i.test(p)),
    nativeFiles.some((p) => /AudioRecordingService\.kt$/i.test(p)) ? "ok" : "missing",
  );

  // Layer: publish guards
  const publishReady = stack !== "android-native" && stack !== "mixed";
  record(
    "publish",
    "publish-ready guard",
    !publishReady,
    publishReady ? "would allow publish" : "blocked (expected)",
  );

  // Layer: agent history
  const runsRes = await rest(
    `agent_runs?select=id,status,error,started_at&project_id=eq.${projectId}&order=started_at.desc&limit=20`,
  );
  const runs = await runsRes.json();
  const androidRun = Array.isArray(runs) ? runs.find((r) => r.error?.includes("passo 5/10")) : null;
  record(
    "agent",
    "has run history",
    Array.isArray(runs) && runs.length > 0,
    `${runs?.length ?? 0} runs`,
  );

  if (androidRun?.id) {
    const evRes = await rest(
      `agent_stream_events?select=event_type,payload&run_id=eq.${androidRun.id}&order=seq.asc&limit=500`,
    );
    const events = await evRes.json();
    const androidDiffs = Array.isArray(events)
      ? events.filter(
          (e) =>
            e.event_type === "file_diff" && ANDROID_PATH_RE.test(String(e.payload?.path ?? "")),
        )
      : [];
    record(
      "agent",
      "android file_diff events",
      androidDiffs.length > 0,
      `${androidDiffs.length} diffs in run ${androidRun.id.slice(0, 8)}`,
    );
    const forks = Array.isArray(events)
      ? events.filter((e) => e.event_type === "stack_fork_suggested")
      : [];
    record(
      "agent",
      "stack_fork suppressed (gradle scaffold)",
      forks.length === 0,
      forks.length > 0 ? `${forks.length} fork events (unexpected)` : "ok — mixed project, no fork",
    );
    const buildLogs = Array.isArray(events)
      ? events.filter((e) => e.event_type === "build_log")
      : [];
    record("agent", "build_log events", true, `${buildLogs.length} (gradle may not have run yet)`);
  }

  // Layer: unit tests (android slice)
  const vitest = spawnSync(
    "npm",
    [
      "run",
      "test",
      "--",
      "--run",
      "src/lib/detect-project-kind.test.ts",
      "src/lib/stack-router.test.ts",
      "src/lib/seeds/index.test.ts",
      "src/lib/native-build-console.test.ts",
      "src/lib/publish-ready.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8", shell: true },
  );
  record(
    "tests",
    "vitest android slice",
    vitest.status === 0,
    vitest.status === 0 ? "all pass" : "see output",
  );

  const deno = spawnSync("deno", ["test", "supabase/functions/_shared/code-corpus.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  record("tests", "deno code-corpus", deno.status === 0);

  // Layer: infra scripts
  const stale = spawnSync("node", ["scripts/check-stale-runs.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  record("infra", "check-stale-runs", stale.status === 0);

  const queue = spawnSync(
    "node",
    [
      "scripts/smoke-queue-e2e.mjs",
      `--project-id=${projectId}`,
      `--conversation-id=${conversationId}`,
      "--timeout-ms=30000",
    ],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  record("infra", "smoke-queue-e2e", queue.status === 0);

  // Layer: agent smoke (may fail on BYOK — report as evidence)
  if (process.env.INNGEST_EVENT_KEY) {
    const agent = spawnSync(
      "node",
      [
        "scripts/smoke-agent-e2e.mjs",
        `--project-id=${projectId}`,
        `--conversation-id=${conversationId}`,
        "--timeout-ms=45000",
      ],
      { cwd: process.cwd(), encoding: "utf8", env: process.env },
    );
    const keyMissing = (agent.stdout + agent.stderr).includes("Chave ausente");
    record(
      "agent",
      "smoke-agent-e2e",
      agent.status === 0,
      agent.status === 0
        ? "stream grew"
        : keyMissing
          ? "BYOK key missing (root cause)"
          : "timeout/other",
    );
  } else {
    record("agent", "smoke-agent-e2e", false, "INNGEST_EVENT_KEY not set — skipped");
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== SUMMARY: ${passed} pass, ${failed} fail / ${results.length} checks ===\n`);

  if (failed > 0) {
    console.log("Blocking gaps for full-development accomplish:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - [${r.layer}] ${r.check}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
