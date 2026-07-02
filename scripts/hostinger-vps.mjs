#!/usr/bin/env node
/**
 * Lista VPS Hostinger via API (developers.hostinger.com).
 * Token: HOSTINGER_KEY ou HOSTINGER_API_TOKEN em ~/.env.local ou .env.local do projeto.
 */
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

const token =
  process.env.HOSTINGER_KEY ??
  process.env.HOSTINGER_API_TOKEN ??
  process.env.BEARER_TOKEN;

if (!token) {
  console.error("HOSTINGER_KEY não encontrado (~/.env.local ou .env.local)");
  process.exit(1);
}

const vmId = process.argv[2];
const base = "https://developers.hostinger.com/api/vps/v1/virtual-machines";
const url = vmId ? `${base}/${vmId}` : base;

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
const body = await res.text();

if (!res.ok) {
  console.error(`Hostinger API ${res.status}:`, body.slice(0, 500));
  process.exit(1);
}

const json = JSON.parse(body);
const rows = Array.isArray(json.data) ? json.data : [json.data ?? json];

for (const vm of rows) {
  console.log(
    [
      `id=${vm.id}`,
      `hostname=${vm.hostname ?? "?"}`,
      `state=${vm.state ?? "?"}`,
      `ipv4=${vm.ipv4?.[0]?.address ?? "?"}`,
    ].join("  "),
  );
}