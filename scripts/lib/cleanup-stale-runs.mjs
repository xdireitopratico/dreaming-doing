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

/** Marca runs stale como failed (opt-in cleanup). */
export async function cleanupStaleRuns({ supabaseUrl, serviceKey, projectId = null, dryRun = false }) {
  const toClean = await fetchStaleRuns({ supabaseUrl, serviceKey, projectId });

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