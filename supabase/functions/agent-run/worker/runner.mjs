/**
 * FORGE agent worker — roda no sandbox E2B (sem limite de 110s da Edge).
 * Lê /home/user/.forge/run.json; emite eventos NDJSON em /home/user/.forge/events.ndjson
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const FORGE_DIR = "/home/user/.forge";
const PROJECT_DIR = "/home/user";
const EVENTS_FILE = path.join(FORGE_DIR, "events.ndjson");
const RUN_FILE = path.join(FORGE_DIR, "run.json");

function emit(type, data = {}) {
  const line = JSON.stringify({ type, ...data, ts: Date.now() });
  fs.appendFileSync(EVENTS_FILE, `${line}\n`);
}

function readConfig() {
  return JSON.parse(fs.readFileSync(RUN_FILE, "utf8"));
}

function sbHeaders(cfg) {
  return {
    "Content-Type": "application/json",
    apikey: cfg.supabaseAnonKey,
    Authorization: `Bearer ${cfg.accessToken}`,
  };
}

async function sbFetch(cfg, method, pathSuffix, body) {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${pathSuffix}`, {
    method,
    headers: {
      ...sbHeaders(cfg),
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${t.slice(0, 200)}`);
  }
  if (method === "GET" && res.status !== 204) {
    return res.json();
  }
  return null;
}

async function isCanceled(cfg) {
  const rows = await sbFetch(
    cfg,
    "GET",
    `agent_runs?id=eq.${cfg.runId}&select=status,canceled_at`,
    null,
  );
  const row = rows?.[0];
  return row?.status === "canceled" || !!row?.canceled_at;
}

async function loadMessages(cfg) {
  const rows = await sbFetch(
    cfg,
    "GET",
    `messages?conversation_id=eq.${cfg.conversationId}&select=role,parts&order=created_at.asc&limit=80`,
    null,
  );
  return (rows ?? []).map((r) => {
    const parts = r.parts ?? [];
    const text = parts
      .filter((p) => p?.type === "text")
      .map((p) => p.text)
      .join("\n");
    return { role: r.role, content: text };
  });
}

async function persistAssistant(cfg, text) {
  await sbFetch(cfg, "POST", "messages", {
    conversation_id: cfg.conversationId,
    role: "assistant",
    parts: [{ type: "text", text }],
    tool_calls: [],
  });
}

async function upsertFile(cfg, filePath, content) {
  const normalized = filePath.replace(/^\//, "");
  const full = path.join(PROJECT_DIR, normalized);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  await sbFetch(cfg, "POST", "project_files", {
    project_id: cfg.projectId,
    path: normalized,
    content,
  });
}

function shellExec(command, env, cwd = PROJECT_DIR, timeoutMs = 180000) {
  const r = spawnSync("/bin/bash", ["-lc", command], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: (r.stdout ?? "").slice(-6000),
    stderr: (r.stderr ?? "").slice(-3000),
  };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "fs_read",
      description: "Lê arquivo local do projeto",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_write",
      description: "Cria ou sobrescreve arquivo (conteúdo completo)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_list",
      description: "Lista arquivos no diretório",
      parameters: {
        type: "object",
        properties: { dir: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell_exec",
      description: "Executa comando shell (npm, git, vercel, etc.)",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
];

async function runTool(cfg, name, args) {
  const env = cfg.env ?? {};
  if (name === "fs_read") {
    const p = path.join(PROJECT_DIR, String(args.path).replace(/^\//, ""));
    if (!fs.existsSync(p)) return { ok: false, error: "arquivo não encontrado" };
    return { ok: true, output: fs.readFileSync(p, "utf8").slice(0, 12000) };
  }
  if (name === "fs_write") {
    await upsertFile(cfg, String(args.path), String(args.content ?? ""));
    return { ok: true, output: { path: args.path, bytes: String(args.content ?? "").length } };
  }
  if (name === "fs_list") {
    const dir = path.join(PROJECT_DIR, String(args.dir ?? ".").replace(/^\//, ""));
    const names = fs.existsSync(dir)
      ? fs.readdirSync(dir, { recursive: true }).slice(0, 200).map(String)
      : [];
    return { ok: true, output: names };
  }
  if (name === "shell_exec") {
    const result = shellExec(String(args.command), env);
    return { ok: result.exitCode === 0, output: result };
  }
  return { ok: false, error: `tool ${name} desconhecida` };
}

async function chatLlm(cfg, messages) {
  const { llm } = cfg;
  const base = (llm.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const body = {
    model: llm.model,
    messages,
    tools: TOOLS,
    tool_choice: "auto",
    temperature: 0.4,
    max_tokens: 4096,
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  const tool_calls = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id ?? crypto.randomUUID(),
    name: tc.function?.name ?? "",
    arguments: JSON.parse(tc.function?.arguments ?? "{}"),
  }));
  return { content: msg.content ?? "", tool_calls };
}

async function main() {
  fs.mkdirSync(FORGE_DIR, { recursive: true });
  fs.writeFileSync(EVENTS_FILE, "");
  const cfg = readConfig();
  const started = Date.now();
  const maxMs = cfg.workerMaxMs ?? 25 * 60 * 1000;
  const maxSteps = cfg.maxSteps ?? 40;

  emit("start", {
    runId: cfg.runId,
    projectId: cfg.projectId,
    worker: true,
    resume: !!cfg.resume,
  });
  emit("phase", { phase: "execute", message: "Trabalhando no projeto…" });

  const history = await loadMessages(cfg);
  const messages = [
    { role: "system", content: cfg.systemPrompt },
    ...history.filter((m) => m.role === "user" || m.role === "assistant"),
  ];

  let steps = 0;
  while (steps < maxSteps && Date.now() - started < maxMs) {
    if (await isCanceled(cfg)) {
      emit("canceled", { message: "Cancelado pelo usuário" });
      emit("finish", { ok: false, error: "Cancelado", steps, canceled: true, resumable: false });
      return;
    }

    steps++;
    emit("phase", { phase: "execute", message: `Passo ${steps}/${maxSteps}` });
    emit("step", { current: steps, total: maxSteps });

    let response;
    try {
      response = await chatLlm(cfg, messages);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emit("error", { error: msg, recoverable: true });
      await persistAssistant(cfg, `Erro no modelo: ${msg}`);
      emit("finish", { ok: false, error: msg, steps, resumable: true });
      return;
    }

    if (response.content?.trim()) {
      emit("assistant_text", { text: response.content.trim() });
    }

    if (!response.tool_calls?.length) {
      const summary = response.content?.trim() || "Tarefa concluída.";
      await persistAssistant(cfg, summary);
      emit("done", { summary });
      emit("finish", { ok: true, summary, steps, resumable: false });
      return;
    }

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      tool_calls: response.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const tc of response.tool_calls) {
      emit("tool_start", { name: tc.name, args: tc.arguments });
      const result = await runTool(cfg, tc.name, tc.arguments);
      emit("tool_done", {
        name: tc.name,
        ok: result.ok,
        error: result.error,
        output: result.output,
      });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(result.ok ? result.output : { error: result.error }),
      });
    }
  }

  const partial = "Limite de passos ou tempo no worker — retome pelo chat se necessário.";
  await persistAssistant(cfg, partial);
  emit("finish", { ok: false, error: partial, steps, resumable: true });
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  emit("error", { error: msg });
  emit("finish", { ok: false, error: msg, steps: 0, resumable: true });
  process.exit(1);
});