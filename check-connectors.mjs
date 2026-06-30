#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i);
    let val = t.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL;
const POSTSQL_KEY = process.env.SUPABASE_POSTSQL_KEY;

console.log("Conectando ao Supabase com POSTSQL_KEY...");
const client = createClient(SUPABASE_URL, POSTSQL_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  try {
    const { data: connectors, error } = await client
      .from("connectors")
      .select("*")
      .order("updated_at", { ascending: false });
    
    if (error) throw error;
    
    console.log(`\n=== CONNECTORS ENCONTRADOS: ${connectors.length} ===\n`);
    
    const byKind = {};
    for (const c of connectors) {
      const kind = c.kind || "unknown";
      if (!byKind[kind]) byKind[kind] = [];
      byKind[kind].push(c);
    }
    
    for (const [kind, items] of Object.entries(byKind)) {
      console.log(`${kind}: ${items.length}`);
      for (const item of items) {
        console.log(`  - ${item.provider} (owner: ${item.owner_id?.slice(0,8)}...)`);
      }
    }
    
    console.log("\n=== AGENT PREFERENCES ===\n");
    const { data: profiles } = await client
      .from("profiles")
      .select("id, agent_preferences")
      .limit(3);
    
    for (const p of profiles || []) {
      console.log(`User: ${p.id.slice(0,8)}...`);
      const prefs = p.agent_preferences;
      if (prefs) {
        console.log(`  webScrapeProvider: ${prefs.webScrapeProvider || "N/A"}`);
        console.log(`  webScrapeFallback: ${prefs.webScrapeFallback || "N/A"}`);
        console.log(`  browserRuntimeProvider: ${prefs.browserRuntimeProvider || "N/A"}`);
      }
    }
    
  } catch (err) {
    console.error("ERRO:", err.message);
    process.exit(1);
  }
}

main();