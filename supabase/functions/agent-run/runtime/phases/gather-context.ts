// runtime/phases/gather-context.ts — Inventário do projeto antes do LLM (Fase 2.2)
import { buildAgentContextForLlm } from "../../run-context.ts";
import { lastPlanContextFromMessages } from "../../plan-mode.ts";
import type { AgentContext, ChatMessage, FileEntry } from "../../types.ts";

export const GATHER_KEY_FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "tailwind.config.ts",
  "index.html",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
] as const;

export type ProjectFileRow = {
  path: string;
  content?: string | null;
  updated_at?: string;
};

export type SkillsStreamPayload = {
  active: string[];
  stack: string[];
  user: string[];
  invoked: string[];
};

export type GatherContextAssembly = {
  context: AgentContext;
  cacheEntries: Array<{ path: string; content: string }>;
  skillsEvent: SkillsStreamPayload | null;
};

export function buildManifestFromFiles(fileList: ProjectFileRow[]): string {
  return fileList.map((f) => `  ${f.path}`).join("\n");
}

export function buildProjectConfigFromFiles(fileList: ProjectFileRow[]): string {
  const keyFiles = fileList.filter((f) =>
    (GATHER_KEY_FILES as readonly string[]).includes(f.path),
  );
  let projectConfig = "";
  for (const f of keyFiles) {
    projectConfig += `\n### ${f.path}\n\`\`\`\n${(f.content ?? "").slice(0, 2000)}\n\`\`\`\n`;
  }
  return projectConfig;
}

export function shouldEmitSkillsEvent(
  userSkillNames: string[],
  lastEmittedSkills: string[] | null,
): boolean {
  const invokedSkills = [...new Set(userSkillNames)];
  return (
    invokedSkills.length > 0 &&
    JSON.stringify(invokedSkills) !== JSON.stringify(lastEmittedSkills)
  );
}

export function buildSkillsStreamPayload(
  userSkillNames: string[],
  stackSkillNames: string[],
): SkillsStreamPayload {
  const invokedSkills = [...new Set(userSkillNames)];
  return {
    active: invokedSkills,
    stack: stackSkillNames,
    user: invokedSkills,
    invoked: invokedSkills,
  };
}

export function assembleGatherContext(input: {
  fileList: ProjectFileRow[];
  messages: ChatMessage[];
  userSkillNames: string[];
  lastEmittedSkills: string[] | null;
  stackSkillNames: string[];
}): GatherContextAssembly {
  const cacheEntries: Array<{ path: string; content: string }> = [];
  for (const f of input.fileList) {
    if (f.content != null) {
      cacheEntries.push({ path: f.path, content: f.content });
    }
  }

  const manifest = buildManifestFromFiles(input.fileList);
  const projectConfig = buildProjectConfigFromFiles(input.fileList);
  const agentCtx = buildAgentContextForLlm(
    input.fileList as FileEntry[],
    projectConfig || "(projeto vazio — sem arquivos de configuração)",
    manifest || "(projeto vazio)",
  );

  const skillsEvent = shouldEmitSkillsEvent(input.userSkillNames, input.lastEmittedSkills)
    ? buildSkillsStreamPayload(input.userSkillNames, input.stackSkillNames)
    : null;

  return {
    cacheEntries,
    skillsEvent,
    context: {
      files: input.fileList as FileEntry[],
      manifest: agentCtx.manifest,
      projectConfig: agentCtx.projectConfig,
      gitLog: "(não disponível ainda)",
      dbSchema: "(não disponível)",
      lastPlan: lastPlanContextFromMessages(input.messages),
    },
  };
}

export type GatherContextPhaseDeps = {
  touchHeartbeat: () => Promise<void>;
  fetchProjectFiles: () => Promise<ProjectFileRow[]>;
  detectStackSkillNames: (files: ProjectFileRow[]) => string[];
  messages: ChatMessage[];
  userSkillNames: string[];
  lastEmittedSkills: string[] | null;
  onFileCached: (path: string, content: string) => void;
  emitSkills: (payload: SkillsStreamPayload) => void;
};

export async function runGatherContextPhase(
  deps: GatherContextPhaseDeps,
): Promise<AgentContext> {
  await deps.touchHeartbeat();
  const fileList = await deps.fetchProjectFiles();
  const assembly = assembleGatherContext({
    fileList,
    messages: deps.messages,
    userSkillNames: deps.userSkillNames,
    lastEmittedSkills: deps.lastEmittedSkills,
    stackSkillNames: deps.detectStackSkillNames(fileList),
  });

  for (const entry of assembly.cacheEntries) {
    deps.onFileCached(entry.path, entry.content);
  }
  if (assembly.skillsEvent) {
    deps.emitSkills(assembly.skillsEvent);
  }

  return assembly.context;
}