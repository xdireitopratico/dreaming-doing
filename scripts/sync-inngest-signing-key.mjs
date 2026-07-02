#!/usr/bin/env node
/**
 * Sincroniza INNGEST_SIGNING_KEY do dashboard (via INNGEST_API_KEY) para os .env.local.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function upsertEnvKey(path, key, value) {
  if (!existsSync(path)) {
    writeFileSync(path, `${key}=${value}\n`, "utf8");
    return;
  }
  const raw = readFileSync(path, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  writeFileSync(path, re.test(raw) ? raw.replace(re, line) : `${raw.trimEnd()}\n${line}\n`, "utf8");
}

const root = resolve(process.cwd());
loadEnvFile(resolve(root, ".env.debug"));
loadEnvFile(resolve(homedir(), ".env.local"));
loadEnvFile(resolve(root, ".env.local"));

const apiKey = process.env.INNGEST_API_KEY;
if (!apiKey) {
  console.error("INNGEST_API_KEY missing (.env.debug)");
  process.exit(1);
}

const envName = process.env.INNGEST_ENV ?? "production";
const res = await fetch("https://api.inngest.com/v2/keys/signing", {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "X-Inngest-Env": envName,
  },
});
if (!res.ok) {
  console.error("Failed to fetch signing key:", res.status, await res.text());
  process.exit(1);
}

const json = await res.json();
const signingKey = json.data?.[0]?.key;
if (!signingKey) {
  console.error("No signing key in API response");
  process.exit(1);
}

const targets = [resolve(homedir(), ".env.local"), resolve(root, ".env.local")];
for (const path of targets) {
  upsertEnvKey(path, "INNGEST_SIGNING_KEY", signingKey);
  console.log(`✓ ${path}`);
}

console.log(`✓ INNGEST_SIGNING_KEY synced (${signingKey.slice(0, 22)}…)`);