import { createClient } from "npm:@supabase/supabase-js@2";
import { FORGE_ADMIN_EMAIL } from "../_shared/forge-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FORGE_ADMIN_EMAIL.toLowerCase();
}

const INNGEST_EVENT_KEY = Deno.env.get("INNGEST_EVENT_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CURATED_SOURCES = [
  { name: "Awwwards", url: "https://www.awwwards.com/websites/", type: "aggregator" as const },
  { name: "FWA", url: "https://thefwa.com/", type: "aggregator" as const },
  { name: "Godly", url: "https://godly.website/", type: "aggregator" as const },
  { name: "Mobbin", url: "https://mobbin.com/browse/ios/apps", type: "aggregator" as const },
  { name: "SiteInspire", url: "https://www.siteinspire.com/", type: "aggregator" as const },
  { name: "Bruno Simon", url: "https://bruno-simon.com/", type: "direct" as const },
  { name: "Locomotive", url: "https://locomotive.ca/", type: "direct" as const },
  { name: "Cuberto", url: "https://cuberto.com/", type: "direct" as const },
  { name: "Hello Monday", url: "https://www.hellomonday.com/", type: "direct" as const },
  { name: "Active Theory", url: "https://activetheory.com/", type: "direct" as const },
  { name: "Ryoji Ikeda", url: "https://www.ryojiikeda.com/", type: "direct" as const },
  { name: "DRIBBBLE", url: "https://dribbble.com/tags/landing_page", type: "aggregator" as const },
  { name: "Behance", url: "https://www.behance.net/search/projects?search=landing+page", type: "aggregator" as const },
  { name: "CSS Design Awards", url: "https://www.cssdesignawards.com/", type: "aggregator" as const },
  { name: "Awwwards Nominees", url: "https://www.awwwards.com/websites/nominees/", type: "aggregator" as const },
];

const SITES_PER_RUN = 5;
const CATEGORIES = ["hero", "motion", "typography", "color_application", "components", "interactions"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");

    // Service-role client (for DB operations + Inngest calls)
    const supabase: any = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // If there's a user token, also create a user-scoped client (for auth.getUser)
    // Use anon key + user JWT for proper user identification
    let userClient: any = null;
    if (token && token !== SERVICE_ROLE_KEY) {
      userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: auth } },
      });
    }

    const { action, urls, depth, categories, jobId, userId, ingestKind } = await req.json().catch(() => ({}));

    switch (action) {
      case "schedule":
        return await handleSchedule(
          supabase,
          userClient,
          urls,
          depth ?? "deep",
          categories ?? CATEGORIES,
          userId ?? null,
          (ingestKind as string | undefined) ?? "production",
        );
      case "trigger_curated":
        return await handleTriggerCurated(supabase, userClient);
      case "continue_queue":
        return await handleContinueQueue(supabase);
      case "status":
        return await handleStatus(supabase, jobId);
      case "emit_event":
        return await handleEmitEvent(supabase, jobId, req);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

async function handleSchedule(
  supabase: any,
  userClient: any,
  urls: string[],
  depth: string,
  categories: string[],
  explicitUserId: string | null = null,
  ingestKind: string = "production",
): Promise<Response> {
  if (!urls?.length || urls.length > 5) {
    return json({ error: "1-5 URLs required" }, 400);
  }

  // Identify user via userClient (if present)
  let userId: string | null = null;
  let userEmail: string | null = null;
  if (userClient) {
    const { data: user } = await userClient.auth.getUser();
    userId = user?.user?.id ?? null;
    userEmail = user?.user?.email ?? null;
  }
  if (!userId && explicitUserId) {
    userId = explicitUserId;
  }

  // service_role (Inngest/cron/tool interno) bypassa auth check
  const isServiceRole = !userClient;
  // Admin: email check (mesma regra do frontend via isForgeAdminEmail)
  if (!isServiceRole && !isAdminEmail(userEmail)) {
    return json({ error: "Apenas administradores podem agendar extração de DesignDNA" }, 403);
  }

  // Cria job na tabela (via service_role client)
  const { data: job, error: insertError } = await supabase
    .from("design_dna_jobs")
    .insert({
      user_id: userId,
      status: "pending",
      depth,
      categories,
      urls,
      current_url_index: 0,
      results: [],
      errors: [],
      meta: { ingestKind },
    })
    .select("id")
    .single();

  if (insertError || !job) {
    return json({ error: `Failed to create job: ${insertError?.message}` }, 500);
  }

  const jobId = (job as Record<string, unknown>).id as string;

  // Dispara Inngest event
  if (!INNGEST_EVENT_KEY) {
    await supabase.from("design_dna_jobs").update({ status: "failed", error: "INNGEST_EVENT_KEY not configured" }).eq("id", jobId);
    return json({ error: "INNGEST_EVENT_KEY not configured" }, 500);
  }

  const eventResult = await sendInngestEvent("design-dna/extract.requested", { jobId, userId, depth, categories, urls, ingestKind });

  if (!eventResult.ok) {
    await supabase.from("design_dna_jobs").update({ status: "failed", error: eventResult.error }).eq("id", jobId);
    return json({ error: eventResult.error }, 500);
  }

  return json({ ok: true, jobId, eventIds: eventResult.ids });
}

async function handleTriggerCurated(
  supabase: any,
  userClient: any,
): Promise<Response> {
  const weekOffset = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const batch = getBatchForWeek(weekOffset, SITES_PER_RUN);

  const urls: string[] = [];
  for (const source of batch) {
    if (source.type === "direct") {
      urls.push(source.url);
    }
  }

  if (urls.length === 0) return json({ ok: true, note: "no direct URLs this week" });

  // Quando chamado por cron/service_role, handleSchedule faz bypass do check admin
  return await handleSchedule(supabase, userClient, urls, "deep", CATEGORIES, null, "curated");
}

async function handleContinueQueue(supabase: any): Promise<Response> {
  const { data: nextJob } = await supabase
    .from("design_dna_job_queue")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextJob) return json({ continued: false, reason: "queue empty" });

  const body = (nextJob as Record<string, unknown>).body as Record<string, unknown> ?? {};

  if (!INNGEST_EVENT_KEY) {
    return json({ continued: false, reason: "INNGEST_EVENT_KEY not configured" });
  }

  const eventResult = await sendInngestEvent("design-dna/extract.requested", {
    jobId: body.jobId,
    userId: body.userId,
    depth: body.depth ?? "deep",
    categories: body.categories ?? CATEGORIES,
    urls: body.urls ?? [],
    ingestKind: body.ingestKind ?? "production",
  });

  if (!eventResult.ok) {
    return json({ continued: false, reason: eventResult.error });
  }

  // Remove da fila
  await supabase.from("design_dna_job_queue").delete().eq("id", (nextJob as Record<string, unknown>).id as string);

  return json({ continued: true, jobId: body.jobId });
}

async function handleStatus(supabase: any, jobId: string): Promise<Response> {
  if (!jobId) return json({ error: "jobId required" }, 400);

  const { data: job } = await supabase
    .from("design_dna_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return json({ error: "Job not found" }, 404);

  return json({ ok: true, job });
}

async function handleEmitEvent(
  supabase: any,
  jobId: string,
  req: Request,
): Promise<Response> {
  if (!jobId) return json({ error: "jobId required" }, 400);

  const { event_type, payload } = await req.json().catch(() => ({}));
  if (!event_type) return json({ error: "event_type required" }, 400);

  const { data: lastRow } = await supabase
    .from("design_dna_events")
    .select("seq")
    .eq("job_id", jobId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = (typeof lastRow?.seq === "number" ? lastRow.seq : 0) + 1;

  const { error } = await supabase.from("design_dna_events").insert({
    id: crypto.randomUUID(),
    job_id: jobId,
    seq: nextSeq,
    event_type,
    payload: payload ?? {},
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, seq: nextSeq });
}

// ── Helpers ──────────────────────────────────────────────────────

function getBatchForWeek(weekOffset: number, count: number) {
  const shuffled = [...CURATED_SOURCES];
  const shift = weekOffset % shuffled.length;
  const rotated = [...shuffled.slice(shift), ...shuffled.slice(0, shift)];
  const aggregators = rotated.filter((s) => s.type === "aggregator");
  const directs = rotated.filter((s) => s.type === "direct");
  return [...aggregators.slice(0, Math.min(2, count)), ...directs.slice(0, count - 2)].slice(0, count);
}

async function sendInngestEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  if (!INNGEST_EVENT_KEY) return { ok: false, error: "INNGEST_EVENT_KEY not configured" };
  try {
    const res = await fetch("https://inn.gs/e/" + INNGEST_EVENT_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data, ts: Date.now() }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Inngest returned ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = (await res.json()) as { ids?: string[] };
    if (!body.ids || body.ids.length === 0) {
      return { ok: false, error: "Inngest returned no event ids" };
    }
    return { ok: true, ids: body.ids };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
