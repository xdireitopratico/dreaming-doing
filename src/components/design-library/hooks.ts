import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLibraryEntries,
  fetchLibraryOverview,
  fetchJobHistory,
  fetchJobDetails,
  fetchJobEvents,
} from "./api";
import type {
  LibraryEntry,
  DesignDnaJob,
  LibraryFilters,
  LibraryOverview,
  RealtimeEvent,
} from "./types";

export function useLibrary(filters: LibraryFilters) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef(filters);
  const hasLoadedOnceRef = useRef(false);
  filtersRef.current = filters;

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (hasLoadedOnceRef.current) {
      setRefreshing(!silent);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [entriesResult, overviewResult] = await Promise.allSettled([
        fetchLibraryEntries(filtersRef.current),
        fetchLibraryOverview(),
      ]);

      if (entriesResult.status === "fulfilled") {
        setEntries(entriesResult.value);
      } else {
        throw entriesResult.reason;
      }

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverview(null);
      }
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [
    load,
    filters.domain,
    filters.mood,
    filters.language,
    filters.category,
    filters.ingestKind,
    filters.minQuality,
    filters.validatedOnly,
    filters.search,
  ]);

  return { entries, overview, loading, refreshing, error, reload: load };
}

export function useJobs() {
  const [jobs, setJobs] = useState<DesignDnaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJobHistory();
      setJobs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Realtime: recarrega a lista apenas quando jobs são criados/atualizados.
    const channel = supabase
      .channel("design-dna-jobs-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "design_dna_jobs" },
        () => load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return { jobs, loading, error, reload: load };
}

export function useJobDetails(jobId: string | null) {
  const [job, setJob] = useState<DesignDnaJob | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchJobDetails(jobId)
      .then((data) => {
        if (!cancelled) setJob(data);
      })
      .catch(() => {
        if (!cancelled) setJob(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return { job, loading };
}

export function useJobEvents(jobId: string | null) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setEvents([]);
      setConnected(false);
      return;
    }

    setEvents([]);
    fetchJobEvents(jobId).then((data) => setEvents(data));

    const channel = supabase
      .channel(`design-dna-events-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "design_dna_events",
          filter: `job_id=eq.${jobId}`,
        },
        (payload: { new?: unknown }) => {
          setEvents((prev) => [...prev, payload.new as RealtimeEvent]);
        },
      )
      .subscribe((status: string) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { events, connected };
}

export function useJobPolling(jobId: string | null) {
  const [job, setJob] = useState<DesignDnaJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchJob = async () => {
      try {
        const data = await fetchJobDetails(jobId);
        if (!cancelled) setJob(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchJob();

    // Realtime: atualiza o job detalhado apenas quando a própria linha muda.
    const channel = supabase
      .channel(`design-dna-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "design_dna_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload: { new?: unknown }) => {
          if (!cancelled) setJob(payload.new as DesignDnaJob | null);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, loading };
}
