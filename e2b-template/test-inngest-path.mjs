import "dotenv/config";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const E2B_API_BASE = "https://api.e2b.app";
const E2B_DOMAIN = "e2b.app";
const ENVD_RELAY = `https://sandbox.${E2B_DOMAIN}`;
const ENVD_PORT = 49983;
const TPL = process.env.E2B_TEMPLATE_TAG || "dreaming-doing-chromium-dev";
const API_KEY = process.env.E2B_API_KEY;

// --- Helper: same encoding used by e2b-client.ts ---
function encodeConnectEnvelope(msg, endStream = false) {
  const payload = new TextEncoder().encode(msg);
  const out = new Uint8Array(5 + payload.length);
  out[0] = endStream ? 0x02 : 0x00;
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}

function decodeConnectBytes(value) {
  try { return atob(value); } catch { return value; }
}

function parseConnectStream(bytes) {
  const messages = [];
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset];
    const len = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false);
    offset += 5;
    if (len > bytes.length - offset) break;
    messages.push(new TextDecoder().decode(bytes.subarray(offset, offset + len)));
    offset += len;
    if (flags & 0x02) break;
  }

  let stdout = "", stderr = "", exitCode = 0;
  for (const m of messages) {
    const frame = JSON.parse(m.trim());
    const ev = frame?.event;
    if (!ev) continue;
    if (ev.data) {
      if (typeof ev.data.stdout === "string") stdout += decodeConnectBytes(ev.data.stdout);
      if (typeof ev.data.stderr === "string") stderr += decodeConnectBytes(ev.data.stderr);
    }
    if (ev.end) {
      const status = typeof ev.end.status === "string" ? ev.end.status : "";
      const m2 = status.match(/(\d+)/);
      exitCode = m2 ? parseInt(m2[1], 10) : (ev.end.exitCode ?? 0);
      break;
    }
  }
  return { exitCode, stdout, stderr };
}

async function runViaConnect(sandboxId, accessToken, command, timeoutMs = 120_000) {
  const body = encodeConnectEnvelope(JSON.stringify({
    process: { cmd: "/bin/bash", args: ["-l", "-c", command], cwd: "/home/user" },
    stdin: false,
  }));
  const resp = await fetch(`${ENVD_RELAY}/process.Process/Start`, {
    method: "POST",
    headers: {
      "E2b-Sandbox-Id": sandboxId,
      "E2b-Sandbox-Port": String(ENVD_PORT),
      "X-Access-Token": accessToken,
      "Content-Type": "application/connect+json",
      "Connect-Protocol-Version": "1",
      "Connect-Timeout-Ms": String(timeoutMs),
      "Keepalive-Ping-Interval": "50",
    },
    body: body,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const raw = new Uint8Array(await resp.arrayBuffer());
  if (!resp.ok) throw new Error(`E2B process ${resp.status}: ${new TextDecoder().decode(raw).slice(0, 400)}`);
  return parseConnectStream(raw);
}

// --- Main ---
async function main() {
  if (!API_KEY) throw new Error("E2B_API_KEY not set");

  console.log("1) Creating sandbox via REST API...");
  const createResp = await fetch(`${E2B_API_BASE}/sandboxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ templateID: TPL, timeout: 900 }),
    signal: AbortSignal.timeout(30_000),
  });
  const createData = await createResp.json();
  assert(createResp.ok, `Create failed: ${createResp.status} ${JSON.stringify(createData)}`);
  const sandboxId = createData.sandboxID ?? createData.sandboxId;
  assert(sandboxId, "No sandboxId in response");
  console.log("   Sandbox:", sandboxId);

  console.log("\n2) Connecting to sandbox...");
  const connResp = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ timeout: 1800 }),
    signal: AbortSignal.timeout(30_000),
  });
  const connData = await connResp.json();
  assert(connResp.ok, `Connect failed: ${connResp.status}`);
  const accessToken = connData.envdAccessToken ?? null;
  console.log("   Access token:", accessToken ? "yes (" + accessToken.slice(0, 20) + "...)" : "no");

  console.log("\n3) Waiting for envd...");
  for (let i = 0; i < 60; i++) {
    try {
      const h = await fetch(`${ENVD_RELAY}/health`, {
        headers: { "E2b-Sandbox-Id": sandboxId, "E2b-Sandbox-Port": String(ENVD_PORT), "X-Access-Token": accessToken },
        redirect: "follow",
      });
      if (h.status === 204) { console.log("   envd ready"); break; }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n4) Preparing Python agent via runViaConnect...");
  const agentPy = readFileSync("../supabase/functions/extract-design-dna/python-agent.py", "utf-8");
  const writeCmd = "cat > /opt/forge/agent.py << 'PYEOF'\n" + agentPy + "\nPYEOF";
  const r0 = await runViaConnect(sandboxId, accessToken, writeCmd, 15_000);
  assert.equal(r0.exitCode, 0, `Write failed: ${r0.stderr}`);
  console.log("   Agent uploaded: " + agentPy.length + " bytes");

  console.log("\n5) Verifying agent file...");
  const r1 = await runViaConnect(sandboxId, accessToken, "wc -c /opt/forge/agent.py", 10_000);
  assert.equal(r1.exitCode, 0);
  console.log("   File size:", r1.stdout.trim());

  console.log("\n6) Running Python agent via runViaConnect...");
  const url = "https://example.com";
  const r2 = await runViaConnect(sandboxId, accessToken, `cd /opt/forge && python3.11 agent.py --url "${url}" --cdp-port 9222 --timeout 120`, 180_000);
  assert.equal(r2.exitCode, 0, `Agent failed (exit ${r2.exitCode}): ${(r2.stderr || "").slice(0, 500)}`);

  console.log("\n7) Parsing agent output...");
  let parsed;
  try {
    parsed = JSON.parse(r2.stdout);
  } catch (e) {
    console.error("JSON parse error:", e.message);
    console.error("stdout (first 1000):", r2.stdout.slice(0, 1000));
    console.error("stderr (first 1000):", slice(r2.stderr, 0, 1000));
    throw e;
  }

  console.log("   url:", parsed.url);
  console.log("   markdown:", (parsed.markdown || "").length, "chars");
  console.log("   colors tags:", Object.keys(parsed.colors || {}));
  console.log("   animations:", (parsed.animations || []).length);
  console.log("   transitions:", (parsed.transitions || []).length);
  console.log("   CSS custom props:", Object.keys(parsed.css_custom_properties || {}).length);
  console.log("   screenshot_base64:", (parsed.screenshot_base64 || "").length, "chars");
  console.log("   screenshot_full_base64:", (parsed.screenshot_full_base64 || "").length, "chars");
  console.log("   screenshots:", (parsed.screenshots || []).length);
  console.log("   viewport:", JSON.stringify(parsed.viewport));

  assert(parsed.markdown, "markdown should not be empty");
  assert(Object.keys(parsed.colors).length > 0, "colors should exist");
  assert(parsed.screenshot_base64, "screenshot should exist");
  assert((parsed.screenshot_full_base64 || "").length > 0, "full screenshot should exist");

  console.log("\n=== ALL TESTS PASSED ===");

  console.log("\n8) Cleaning up sandbox...");
  await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}`, {
    method: "DELETE",
    headers: { "X-API-Key": API_KEY },
  });
  console.log("   Sandbox killed");
}

function slice(s, start, len) {
  if (!s) return "";
  return s.slice(start, start + len);
}

main().catch(e => { console.error("\nFAIL:", e.message); process.exit(1); });
