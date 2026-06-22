import { shouldSkipStaleExpiry } from "./stale-run-filter.mjs";

const STALE_MS = 15 * 60 * 1000;

export async function fetchStaleRuns({ supabaseUrl, serviceKey, projectId = null }) {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  let url = `${supabaseUrl}/rest/v1/agent_runs?status=in.(running,pending)&started_at=lt.${cutoff}&select=id,project_id,status,started_at,error,meta&order=started_at.asc`;
  if (projectId) url += `&project_id=eq.${projectId}`;

  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const rows = await res.json();
  if (!res.ok) throw new Error(`fetchStaleRuns: ${JSON.stringify(rows).slice(0, 200)}`);
  return rows ?? [];
}

export async function lastStreamEvent(supabaseUrl, serviceKey, runId) {
  const url = `${supabaseUrl}/rest/v1/agent_stream_events?run_id=eq.${runId}&select=event_type,created_at&order=seq.desc&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const rows = await res.json();
  if (!res.ok || !rows?.[0]) return { lastEventType: null, lastEventAt: null };
  return {
    lastEventType: rows[0].event_type ?? null,
    lastEventAt: rows[0].created_at ?? null,
  };
}

/** Marca runs stale como failed (opt-in cleanup). */
export async function cleanupStaleRuns({ supabaseUrl, serviceKey, projectId = null, dryRun = false }) {
  const rows = await fetchStaleRuns({ supabaseUrl, serviceKey, projectId });
  const toClean = [];

  for (const row of rows) {
    const stream = await lastStreamEvent(supabaseUrl, serviceKey, row.id);
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    if (
      shouldSkipStaleExpiry({
        meta,
        lastEventType: stream.lastEventType,
        lastEventAt: stream.lastEventAt,
      })
    ) {
      continue;
    }
    toClean.push(row);
  }

  if (dryRun) return { cleaned: 0, candidates: toClean };

  const now = new Date().toISOString();
  for (const row of toClean) {
    await fetch(`${supabaseUrl}/rest/v1/agent_runs?id=eq.${row.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "failed",
        finished_at: now,
        error: "stale cleanup — gate e2e",
      }),
    });
  }

  return { cleaned: toClean.length, candidates: toClean };
}