import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_CRED_PATH = resolve(process.cwd(), ".e2e/credentials.json");

export function loadSavedCredentials(path = process.env.E2E_CREDENTIALS_PATH ?? DEFAULT_CRED_PATH) {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.email && parsed?.password) {
      return { email: parsed.email, password: parsed.password, userId: parsed.userId ?? null, path };
    }
  } catch {
    // missing
  }
  return null;
}

export async function provisionE2eUser({
  supabaseUrl,
  serviceKey,
  credPath = process.env.E2E_CREDENTIALS_PATH ?? DEFAULT_CRED_PATH,
}) {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = process.env.E2E_EMAIL ?? `e2e-forge+${Date.now()}@forge-e2e.local`;
  const password = process.env.E2E_PASSWORD ?? randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { e2e: true, provisionedAt: new Date().toISOString() },
  });

  if (error) {
    throw new Error(`provisionE2eUser: ${error.message}`);
  }

  const creds = { email, password, userId: data.user?.id ?? null };
  await mkdir(dirname(resolve(credPath)), { recursive: true });
  writeFileSync(credPath, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

  if (creds.userId && process.env.E2E_SEED_AGENT_SETUP !== "0") {
    try {
      const { seedE2eAgentSetup } = await import("./e2e-agent-setup.mjs");
      await seedE2eAgentSetup({ supabaseUrl, serviceKey, userId: creds.userId });
    } catch (e) {
      console.warn(
        "E2E: seed agent setup falhou (journey fará retry):",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { ...creds, path: credPath };
}

/**
 * Resolve credenciais E2E: env → arquivo → provision via service role.
 */
export async function resolveE2eCredentials({
  supabaseUrl,
  serviceKey,
  anonKey,
  autoProvision = process.env.E2E_AUTO_PROVISION !== "0",
}) {
  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    return {
      email: process.env.E2E_EMAIL,
      password: process.env.E2E_PASSWORD,
      source: "env",
    };
  }

  const saved = loadSavedCredentials();
  if (saved) {
    process.env.E2E_EMAIL = saved.email;
    process.env.E2E_PASSWORD = saved.password;
    return { email: saved.email, password: saved.password, userId: saved.userId, source: "file" };
  }

  if (!autoProvision || !serviceKey || !supabaseUrl) return null;

  const creds = await provisionE2eUser({ supabaseUrl, serviceKey });
  process.env.E2E_EMAIL = creds.email;
  process.env.E2E_PASSWORD = creds.password;
  console.log(`E2E: usuário provisionado (${creds.email}) → ${creds.path}`);
  return { ...creds, source: "provisioned" };
}