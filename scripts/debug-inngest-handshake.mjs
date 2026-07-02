#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
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

loadEnvFile(resolve(homedir(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const signingKey = process.env.INNGEST_SIGNING_KEY ?? "";
if (!signingKey) {
  console.error("INNGEST_SIGNING_KEY missing");
  process.exit(1);
}

const prefix = signingKey.match(/^signkey-[\w]+-/)?.[0] ?? "";
const key = signingKey.replace(/^signkey-[\w]+-/, "");
const hashed = `${prefix}${createHash("sha256").update(key, "hex").digest("hex")}`;

const resp = await fetch("https://api.inngest.com/v0/connect/start", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${hashed}`,
    "Content-Type": "application/protobuf",
  },
  body: new Uint8Array([0]),
});

const body = await resp.text();
console.log("status", resp.status);
console.log("body", body.slice(0, 500));