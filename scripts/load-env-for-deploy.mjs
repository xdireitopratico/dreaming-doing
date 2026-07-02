#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
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

const root = resolve(process.cwd());
loadEnvFile(resolve(homedir(), ".env.local"));
loadEnvFile(resolve(root, ".env.local"));

async function resolveSigningKeyFromApi() {
  const apiKey = process.env.INNGEST_API_KEY;
  if (!apiKey) return;
  const envName = process.env.INNGEST_ENV ?? "production";
  const res = await fetch("https://api.inngest.com/v2/keys/signing", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Inngest-Env": envName,
    },
  });
  if (!res.ok) return;
  const json = await res.json();
  const key = json.data?.[0]?.key;
  if (key) process.env.INNGEST_SIGNING_KEY = key;
}

loadEnvFile(resolve(root, ".env.debug"));

await resolveSigningKeyFromApi();

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_EVENT_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

for (const key of required) {
  console.log(`${key}=${process.env[key]}`);
}