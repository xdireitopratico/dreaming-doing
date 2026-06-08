import type { AgentProgress } from "@/lib/agent-progress";

const NATIVE_PATH_RE =
  /(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|gradlew|app\/src\/main\/|\.kt$|AndroidManifest\.xml)/i;

export type NativeBuildLogLine = {
  command: string;
  line: string;
  ok: boolean;
  ts: number;
};

export function isNativeProjectPath(path: string): boolean {
  const normalized = path.replace(/^\//, "");
  return NATIVE_PATH_RE.test(normalized);
}

export function collectNativeProjectFiles(
  files: Array<{ path: string }>,
): string[] {
  return files
    .map((f) => f.path.replace(/^\//, ""))
    .filter(isNativeProjectPath)
    .sort();
}

export function collectBuildLogLines(progress: AgentProgress | null): NativeBuildLogLine[] {
  if (!progress?.buildLogLines?.length) return [];
  return progress.buildLogLines.slice(-80);
}

export function collectShellCommands(progress: AgentProgress | null): string[] {
  const cmds: string[] = [];
  for (const t of progress?.tools ?? []) {
    if (t.name !== "shell_exec") continue;
    const cmd = String(t.args?.command ?? "").trim();
    if (!cmd || !/gradle|gradlew|assemble/i.test(cmd)) continue;
    cmds.push(cmd);
  }
  return cmds.slice(-6);
}