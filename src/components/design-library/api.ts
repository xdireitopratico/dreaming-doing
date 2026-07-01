import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import type {
  LibraryEntry,
  DesignDnaJob,
  LibraryFilters,
  LibraryOverview,
  RealtimeEvent,
  DesignDnaInstruction,
} from "./types";

export async function postInstruction(
  jobId: string,
  content: string,
  role: "user" | "system" = "user",
): Promise<void> {
  const { url } = getSupabaseEnv();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${url}/functions/v1/design-library-instructions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId, content, role }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

export async function fetchInstructions(jobId: string): Promise<DesignDnaInstruction[]> {
  const { data, error } = await supabase
    .from("design_dna_instructions")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DesignDnaInstruction[];
}


export async function fetchLibraryEntries(filters: LibraryFilters): Promise<LibraryEntry[]> {
  let query = supabase
    .from("design_system_library")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.domain) {
    query = query.contains("serves_domains", [filters.domain]);
  }
  if (filters.mood) {
    query = query.contains("compatible_moods", [filters.mood]);
  }
  if (filters.language) {
    query = query.contains("compatible_languages", [filters.language]);
  }
  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters.ingestKind && filters.ingestKind !== "all") {
    query = query.eq("ingest_kind", filters.ingestKind);
  }
  if (filters.minQuality > 0) {
    query = query.gte("quality_score", filters.minQuality);
  }
  if (filters.validatedOnly) {
    query = query.eq("validated", true);
  }
  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,source_url.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as LibraryEntry[];
}

export async function fetchLibraryOverview(): Promise<LibraryOverview | null> {
  const { data, error } = await supabase.rpc("design_library_overview", {
    include_archived: false,
  });

  if (error) {
    console.warn("[design-library] overview failed:", error.message);
    return null;
  }

  return (data ?? null) as LibraryOverview | null;
}

export async function fetchJobHistory(): Promise<DesignDnaJob[]> {
  const { data, error } = await supabase
    .from("design_dna_jobs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as DesignDnaJob[];
}

export async function createExtractionJob(
  urls: string[],
  depth: string,
  categories: string[],
  ingestKind: "production" | "curated" | "smoke" | "manual" = "production",
): Promise<{ jobId: string }> {
  const { data, error } = await supabase.functions.invoke("design-dna-scheduler", {
    body: { action: "schedule", urls, depth, categories, ingestKind },
  });

  if (error) throw new Error(error.message ?? "Failed to create extraction job");
  return data as { jobId: string };
}

export async function validateEntry(id: string, validated: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("design_system_library")
    .update({ validated })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Nenhuma linha foi alterada. Verifique permissão ou se o item ainda existe.");
  }
}

export async function archiveEntry(id: string, archived: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("design_system_library")
    .update({ is_archived: archived })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Nenhuma linha foi alterada. Verifique permissão ou se o item ainda existe.");
  }
}

export async function deleteEntry(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("design_system_library")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Nenhuma linha foi removida. Verifique permissão ou se o item ainda existe.");
  }
}

export async function cancelExtractionJob(jobId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("design-dna-scheduler", {
    body: { action: "cancel", jobId },
  });
  if (error) throw new Error(error.message ?? "Failed to cancel extraction job");
}

export async function fetchJobDetails(jobId: string): Promise<DesignDnaJob | null> {
  const { data, error } = await supabase
    .from("design_dna_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) return null;
  return data as DesignDnaJob;
}

export async function fetchJobEvents(jobId: string): Promise<RealtimeEvent[]> {
  const { data, error } = await supabase
    .from("design_dna_events")
    .select("*")
    .eq("job_id", jobId)
    .order("seq", { ascending: true });

  if (error) return [];
  return (data ?? []) as RealtimeEvent[];
}
