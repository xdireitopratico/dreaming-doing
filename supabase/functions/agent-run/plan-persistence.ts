// plan-persistence.ts — Repository pattern para plans (FORGE 2.0).
// Desacopla persistência da lógica de negócio do agente.
// Gemini 2.5 Pro feedback: abstrair DB direto do loop.

export interface PlanRecord {
  id: string;
  runId: string;
  projectId: string;
  conversationId?: string | null;
  status: "proposed" | "approved" | "rejected" | "expired";
  mission?: string;
  summary?: string;
  objective?: string;
  rationale?: string;
  assumptions?: string[];
  outOfScope?: string[];
  steps: Array<{
    id: string;
    description: string;
    filePath?: string;
    enabled: boolean;
  }>;
  phases?: Array<{
    id: string;
    title: string;
    goal: string;
    tasks: string[];
  }>;
  markdown?: string;
  createdAt: string;
  decidedAt?: string;
  expiresAt: string;
}

export interface PlanRepository {
  create(plan: Omit<PlanRecord, "id" | "createdAt" | "decidedAt">): Promise<PlanRecord>;
  findById(id: string): Promise<PlanRecord | null>;
  findByRunId(runId: string): Promise<PlanRecord | null>;
  updateStatus(
    id: string,
    status: PlanRecord["status"],
  ): Promise<void>;
  expireStale(): Promise<number>;
}

/** Supabase-backed plan repository. */
export function createSupabasePlanRepository(sb: any): PlanRepository {
  return {
    async create(plan) {
      const { data } = await sb
        .from("plans")
        .insert({
          run_id: plan.runId,
          project_id: plan.projectId,
          conversation_id: plan.conversationId ?? null,
          status: plan.status,
          mission: plan.mission,
          summary: plan.summary,
          objective: plan.objective,
          rationale: plan.rationale,
          assumptions: plan.assumptions ?? [],
          out_of_scope: plan.outOfScope ?? [],
          steps: plan.steps,
          phases: plan.phases ?? [],
          markdown: plan.markdown,
          expires_at: plan.expiresAt,
        })
        .select("*")
        .single();

      return mapRow(data);
    },

    async findById(id) {
      const { data } = await sb.from("plans").select("*").eq("id", id).maybeSingle();
      return data ? mapRow(data) : null;
    },

    async findByRunId(runId) {
      const { data } = await sb
        .from("plans")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? mapRow(data) : null;
    },

    async updateStatus(id, status) {
      await sb
        .from("plans")
        .update({
          status,
          decided_at: status !== "proposed" ? new Date().toISOString() : null,
        })
        .eq("id", id);
    },

    async expireStale() {
      const { count } = await sb
        .from("plans")
        .update({ status: "expired" })
        .eq("status", "proposed")
        .lt("expires_at", new Date().toISOString())
        .select("id", { count: "exact" });
      return count ?? 0;
    },
  };
}

function mapRow(row: any): PlanRecord {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    conversationId: row.conversation_id ?? null,
    status: row.status,
    mission: row.mission,
    summary: row.summary,
    objective: row.objective,
    rationale: row.rationale,
    assumptions: Array.isArray(row.assumptions) ? row.assumptions : [],
    outOfScope: Array.isArray(row.out_of_scope) ? row.out_of_scope : [],
    steps: Array.isArray(row.steps) ? row.steps : [],
    phases: Array.isArray(row.phases) ? row.phases : [],
    markdown: row.markdown,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
    expiresAt: row.expires_at,
  };
}
