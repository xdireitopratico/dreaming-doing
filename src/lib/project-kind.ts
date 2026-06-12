export type ProjectKind = "app" | "agent";

export type ProjectListRow = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string | null;
  created_at: string | null;
  kind?: ProjectKind | null;
  meta: Record<string, unknown> | null;
};

export function resolveProjectKind(row: Pick<ProjectListRow, "kind" | "meta">): ProjectKind {
  if (row.kind === "agent" || row.kind === "app") return row.kind;
  const metaKind = row.meta?.kind;
  if (metaKind === "agent" || metaKind === "app") return metaKind;
  return "app";
}

export function isAppProject(row: Pick<ProjectListRow, "kind" | "meta">): boolean {
  return resolveProjectKind(row) === "app";
}

export function isAgentProject(row: Pick<ProjectListRow, "kind" | "meta">): boolean {
  return resolveProjectKind(row) === "agent";
}