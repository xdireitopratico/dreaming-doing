import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

function loadEnvFile(path) {
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
  } catch {
    // optional
  }
}

/** Carrega .env.local (projeto + ~/.env.local) sem sobrescrever o ambiente. */
export function loadEnvLocal(cwd = process.cwd()) {
  loadEnvFile(resolve(cwd, ".env.local"));
  loadEnvFile(resolve(homedir(), ".env.local"));
}