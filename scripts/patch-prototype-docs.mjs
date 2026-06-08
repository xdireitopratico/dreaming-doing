#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ID = "27d4fd0c-9783-44ac-9446-70bd931620ac";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const key = t.slice(0, i);
  let val = t.slice(i + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ANDROID_README = `# HermesVoice — Android (Kotlin)

Protótipo nativo no mesmo repositório do app web FORGE.

## Stack
- Kotlin + Jetpack Compose + Hilt + Room + Retrofit
- app/src/main — MainActivity, AudioRecordingService, DI, API

## Build
\`\`\`bash
./gradlew assembleDebug
\`\`\`

## Estrutura validada
- MainActivity.kt — UI Compose + permissão de microfone
- AudioRecordingService.kt — foreground service
- AppDatabase + DAOs — persistência local
- NetworkModule — Retrofit/Moshi/OkHttp
`;

const README_PATCH = `# Forge App

Projeto **misto**: web (Vite + React) + Android nativo (HermesVoice).

## Web
\`\`\`bash
npm install
npm run dev
\`\`\`

## Android
Veja [ANDROID.md](./ANDROID.md) — \`./gradlew assembleDebug\`
`;

async function upsert(path, content) {
  const hdr = { apikey: key, Authorization: `Bearer ${key}` };
  const get = await fetch(
    `${url}/rest/v1/project_files?select=id&project_id=eq.${PROJECT_ID}&path=eq.${encodeURIComponent(path)}`,
    { headers: hdr },
  );
  const ex = await get.json();
  if (ex[0]?.id) {
    await fetch(`${url}/rest/v1/project_files?id=eq.${ex[0].id}`, {
      method: "PATCH",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
    });
  } else {
    await fetch(`${url}/rest/v1/project_files`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: PROJECT_ID, path, content }),
    });
  }
}

await upsert("ANDROID.md", ANDROID_README);
await upsert("README.md", README_PATCH);
console.log("ANDROID.md + README.md updated");