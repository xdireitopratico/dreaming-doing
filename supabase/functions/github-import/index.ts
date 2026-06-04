// github-import/index.ts — Importa um repo PÚBLICO via zipball API do GitHub.
// Sem OAuth. Cria projeto + insere project_files. Pula binários e arquivos grandes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const MAX_FILES = 2000;
const SKIP_PATHS = /(?:^|\/)(?:node_modules|\.git|dist|build|\.next|\.cache|coverage|\.turbo)\//;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|mp3|mp4|mov|wav|ogg|webm|avi|mkv|pdf|zip|tar|gz|7z|rar|woff2?|ttf|eot|otf|exe|dll|so|dylib|wasm|class|jar)$/i;

function parseRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("github.com")) return null;
    const [, owner, repo] = u.pathname.split("/");
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 50) || "import";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url) return json({ error: "url obrigatório" }, 400);
    const parsed = parseRepo(url);
    if (!parsed) return json({ error: "URL inválida (esperado github.com/owner/repo)" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
    const userId = userData.user.id;

    // Baixa o zipball (default branch)
    const zipUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball`;
    const zipResp = await fetch(zipUrl, {
      headers: { "User-Agent": "forge-import", Accept: "application/vnd.github+json" },
      redirect: "follow",
    });
    if (!zipResp.ok) {
      return json({ error: `GitHub ${zipResp.status}: repo não encontrado ou privado` }, 404);
    }
    const zipBuf = new Uint8Array(await zipResp.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuf);

    // Coleta arquivos válidos
    const entries: Array<{ path: string; content: string }> = [];
    const decoder = new TextDecoder("utf-8", { fatal: false });

    for (const [filename, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      // GitHub prefixa com "{owner}-{repo}-{sha}/"
      const rel = filename.split("/").slice(1).join("/");
      if (!rel) continue;
      if (SKIP_PATHS.test("/" + rel + "/")) continue;
      if (BINARY_EXT.test(rel)) continue;

      const buf = await entry.async("uint8array");
      if (buf.byteLength > MAX_FILE_SIZE) continue;
      // Heurística de binário: null bytes nos primeiros 8KB
      const sample = buf.slice(0, Math.min(buf.length, 8192));
      let nulls = 0;
      for (let i = 0; i < sample.length; i++) if (sample[i] === 0) nulls++;
      if (nulls > 0) continue;

      const text = decoder.decode(buf);
      entries.push({ path: rel, content: text });
      if (entries.length >= MAX_FILES) break;
    }

    if (entries.length === 0) {
      return json({ error: "Nenhum arquivo de texto importável encontrado" }, 400);
    }

    // Cria projeto
    const name = parsed.repo;
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
    const { data: project, error: pErr } = await supabase.from("projects").insert({
      owner_id: userId,
      name,
      slug,
      description: `Importado de github.com/${parsed.owner}/${parsed.repo}`,
      template: "imported",
      meta: { source: { kind: "github", owner: parsed.owner, repo: parsed.repo, url } },
    }).select("id").single();
    if (pErr || !project) return json({ error: pErr?.message ?? "Falha ao criar projeto" }, 500);

    // Insere em chunks de 50
    const rows = entries.map((e) => ({ project_id: project.id, path: e.path, content: e.content }));
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error: fErr } = await supabase.from("project_files").insert(chunk);
      if (fErr) {
        return json({ error: `Falha em batch ${i}: ${fErr.message}` }, 500);
      }
    }

    // Conversa inicial
    const { data: conv, error: cErr } = await supabase.from("conversations").insert({
      project_id: project.id,
      title: name,
    }).select("id").single();
    if (cErr || !conv) return json({ error: cErr?.message ?? "Falha ao criar conversa" }, 500);

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "assistant",
      parts: [{ type: "text", text: `Importei **${entries.length}** arquivos do repositório \`${parsed.owner}/${parsed.repo}\`. Manda o que você quer mudar.` }],
      tool_calls: [],
    });

    return json({
      projectId: project.id,
      conversationId: conv.id,
      fileCount: entries.length,
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
