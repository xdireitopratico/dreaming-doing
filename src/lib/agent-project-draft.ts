import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ProjectDraftFlow = {
  id: string;
  status: string;
  flow_definition?: Record<string, unknown> | null;
};

export function findProjectDraft<T extends { status: string }>(flows: T[]): T | undefined {
  return flows.find((f) => f.status === "draft");
}

export interface UpsertProjectDraftInput {
  projectId: string;
  userId: string;
  name: string;
  description?: string | null;
  briefing?: Record<string, unknown>;
  existingDraft?: ProjectDraftFlow | null;
}

export async function upsertProjectDraftFlow(
  supabase: SupabaseClient<Database>,
  input: UpsertProjectDraftInput,
): Promise<{ flowId: string | null; error: string | null }> {
  const { projectId, userId, name, description, briefing, existingDraft } = input;

  if (existingDraft) {
    const prevDef = (existingDraft.flow_definition ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from("agent_flows")
      .update({
        name,
        description: description ?? null,
        flow_definition: JSON.parse(
          JSON.stringify({
            ...prevDef,
            nodes: (prevDef.nodes as unknown[]) ?? [],
            edges: (prevDef.edges as unknown[]) ?? [],
            briefing: briefing
              ? {
                  ...((prevDef.briefing as Record<string, unknown>) ?? {}),
                  ...briefing,
                }
              : prevDef.briefing,
          }),
        ),
      })
      .eq("id", existingDraft.id);

    if (error) return { flowId: null, error: error.message };
    return { flowId: existingDraft.id, error: null };
  }

  const { data, error } = await supabase
    .from("agent_flows")
    .insert({
      name,
      description: description ?? null,
      user_id: userId,
      project_id: projectId,
      flow_definition: JSON.parse(
        JSON.stringify({
          nodes: [],
          edges: [],
          ...(briefing ? { briefing } : {}),
        }),
      ),
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { flowId: null, error: error?.message ?? "Falha ao criar rascunho" };
  }
  return { flowId: (data as { id: string }).id, error: null };
}