import { supabase } from "@/integrations/supabase/client";
import type { LibraryEntry, DesignDnaJob, LibraryFilters, RealtimeEvent } from "./types";

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
