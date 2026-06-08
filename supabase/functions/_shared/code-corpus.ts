/** Captura best-effort de código gerado → code_corpus (service role only). */

export type CodeCorpusCaptureReason = "agent_write" | "agent_edit" | "project_deleted";

export type CodeCorpusCaptureInput = {
  projectId: string;
  userId?: string | null;
  path: string;
  content: string;
  stackKind?: string | null;
  runId?: string | null;
  reason: CodeCorpusCaptureReason;
};

const ANDROID_NATIVE_HINTS = [
  "build.gradle",
  "build.gradle.kts",
  "app/src/main",
  "settings.gradle",
];

const EXPO_HINTS = ["app.json", "app.config", "expo/"];

export async function hashContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Infere stack a partir do template do projeto e do path do arquivo. */
export function inferStackKind(
  projectTemplate: string | null | undefined,
  filePath: string,
): string {
  const normalized = filePath.replace(/^\//, "").toLowerCase();
  if (ANDROID_NATIVE_HINTS.some((h) => normalized.includes(h))) return "android-native";
  if (EXPO_HINTS.some((h) => normalized.includes(h))) return "expo";
  if (projectTemplate?.includes("expo")) return "expo";
  if (projectTemplate?.includes("android")) return "android-native";
  return projectTemplate?.trim() || "vite-react";
}

export async function captureToCodeCorpus(
  supabase: { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } },
  input: CodeCorpusCaptureInput,
): Promise<void> {
  const content = input.content ?? "";
  if (!input.path.trim()) return;

  const content_hash = await hashContent(content);
  const stack_kind = input.stackKind ?? inferStackKind(null, input.path);

  const { error } = await supabase.from("code_corpus").insert({
    source_project_id: input.projectId,
    source_user_id: input.userId ?? null,
    path: input.path,
    content,
    content_hash,
    stack_kind,
    capture_reason: input.reason,
    run_id: input.runId ?? null,
    captured_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("[code_corpus] capture failed", input.path, error.message);
  }
}

/** Fire-and-forget — nunca bloqueia fs_write/fs_edit. */
export function captureToCodeCorpusAsync(
  supabase: Parameters<typeof captureToCodeCorpus>[0],
  input: CodeCorpusCaptureInput,
): void {
  void captureToCodeCorpus(supabase, input).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[code_corpus] async capture error", input.path, msg);
  });
}

export type ProjectFileRow = { path: string; content: string | null };

/** Snapshot final de todos os arquivos antes do delete do projeto. */
export async function snapshotProjectFilesToCorpus(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: ProjectFileRow[] | null; error: { message: string } | null }>;
      };
      insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
    };
  },
  opts: {
    projectId: string;
    userId: string;
    projectTemplate?: string | null;
  },
): Promise<{ captured: number; error?: string }> {
  const { data: files, error: readErr } = await supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", opts.projectId);

  if (readErr) {
    return { captured: 0, error: readErr.message };
  }
  if (!files?.length) {
    return { captured: 0 };
  }

  const rows: Record<string, unknown>[] = [];
  for (const file of files) {
    const content = file.content ?? "";
    rows.push({
      source_project_id: opts.projectId,
      source_user_id: opts.userId,
      path: file.path,
      content,
      content_hash: await hashContent(content),
      stack_kind: inferStackKind(opts.projectTemplate, file.path),
      capture_reason: "project_deleted",
      run_id: null,
      captured_at: new Date().toISOString(),
    });
  }

  const BATCH = 100;
  let captured = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error: insErr } = await supabase.from("code_corpus").insert(chunk);
    if (insErr) {
      return { captured, error: insErr.message };
    }
    captured += chunk.length;
  }

  return { captured };
}