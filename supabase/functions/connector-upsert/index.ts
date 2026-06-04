import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED = new Set(["github", "vercel", "cloudflare", "anthropic", "openai"]);

type PoolSlot = { id: string; hint: string; addedAt: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePool(tokenField: string | null): string[] {
  if (!tokenField?.trim()) return [];
  const t = tokenField.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x.length > 0);
    } catch { /* single token */ }
  }
  return [t];
}

function keyHint(token: string): string {
  const t = token.trim();
  if (t.length <= 4) return "••••";
  return `…${t.slice(-4)}`;
}

function buildPoolSlots(tokens: string[], prev?: PoolSlot[]): PoolSlot[] {
  return tokens.map((token, i) => {
    const hint = keyHint(token);
    const old = prev?.[i];
    if (old && old.hint === hint) return old;
    return {
      id: old?.id ?? crypto.randomUUID(),
      hint,
      addedAt: old?.addedAt ?? new Date().toISOString(),
    };
  });
}

function poolResponse(meta: Record<string, unknown>, connected: boolean) {
  const slots = (meta.poolSlots as PoolSlot[]) ?? [];
  const poolCount = (meta.poolCount as number) ?? slots.length;
  return { ok: true, connected, poolCount, poolSlots: slots };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json();
    const kind = body?.kind as string;
    if (!kind || !ALLOWED.has(kind)) return json({ error: "Connector inválido" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const metaIn =
      typeof body?.meta === "object" && body.meta !== null ? body.meta : {};
    const provider = typeof metaIn.provider === "string" ? metaIn.provider : undefined;

    const loadOpenAiRow = async () => {
      const { data } = await admin
        .from("connectors")
        .select("id, token_encrypted, meta")
        .eq("owner_id", user.id)
        .eq("kind", "openai")
        .maybeSingle();
      return data;
    };

    if (body?.disconnect === true) {
      if (kind === "openai" && provider) {
        const row = await loadOpenAiRow();
        const rowProvider = (row?.meta as Record<string, string>)?.provider;
        if (row && rowProvider === provider) {
          await admin.from("connectors").delete().eq("id", row.id);
        }
      } else {
        await admin.from("connectors").delete().eq("owner_id", user.id).eq("kind", kind);
      }
      if (kind === "github") {
        await admin.from("profiles").update({ github_username: null }).eq("id", user.id);
      }
      return json({ ok: true, connected: false, poolCount: 0, poolSlots: [] });
    }

    const removePoolKey = typeof body?.removePoolKey === "string" ? body.removePoolKey : null;
    if (removePoolKey && kind === "openai" && provider) {
      const row = await loadOpenAiRow();
      if (!row) return json({ error: "Nenhum pool encontrado" }, 404);
      const rowMeta = (row.meta ?? {}) as Record<string, unknown>;
      if (rowMeta.provider !== provider) return json({ error: "Provedor não corresponde" }, 400);

      const pool = parsePool(row.token_encrypted);
      const slots = (rowMeta.poolSlots as PoolSlot[]) ?? buildPoolSlots(pool);
      const idx = slots.findIndex((s) => s.id === removePoolKey);
      if (idx < 0) return json({ error: "Chave não encontrada no pool" }, 404);

      pool.splice(idx, 1);
      const newSlots = buildPoolSlots(pool);

      if (pool.length === 0) {
        await admin.from("connectors").delete().eq("id", row.id);
        return json({ ok: true, connected: false, poolCount: 0, poolSlots: [] });
      }

      const newMeta = {
        ...rowMeta,
        poolCount: pool.length,
        poolSlots: newSlots,
        updatedAt: new Date().toISOString(),
      };
      await admin.from("connectors").update({
        token_encrypted: JSON.stringify(pool),
        meta: newMeta,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);

      return json(poolResponse(newMeta, true));
    }

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token && kind === "vercel") {
      return json({ error: "Token Vercel obrigatório" }, 400);
    }

    let tokenEncrypted: string | undefined;
    let pool: string[] = [];
    let poolSlots: PoolSlot[] = [];

    if (body?.appendToPool === true && token) {
      const existing = kind === "openai" ? await loadOpenAiRow() : null;
      const existingProvider = (existing?.meta as Record<string, string>)?.provider;
      const prevSlots = (existing?.meta as Record<string, unknown>)?.poolSlots as PoolSlot[] | undefined;

      pool = parsePool(existing?.token_encrypted ?? null);
      if (!existing || existingProvider === provider || !provider) {
        pool.push(token);
      } else {
        pool = [token];
      }
      poolSlots = buildPoolSlots(pool, prevSlots);
      tokenEncrypted = JSON.stringify(pool);
    } else if (token) {
      pool = [token];
      poolSlots = buildPoolSlots(pool);
      tokenEncrypted = token.length > 1 && token.startsWith("[") ? token : token;
      if (pool.length > 1) tokenEncrypted = JSON.stringify(pool);
    }

    const meta: Record<string, unknown> = {
      ...metaIn,
      poolCount: pool.length || (token ? 1 : 0),
      poolSlots,
      connectedAt: new Date().toISOString(),
      label: metaIn.label ?? kind,
    };

    const row: Record<string, unknown> = {
      owner_id: user.id,
      kind,
      meta,
      updated_at: new Date().toISOString(),
    };
    if (tokenEncrypted) row.token_encrypted = tokenEncrypted;

    const { error } = await admin.from("connectors").upsert(row, {
      onConflict: "owner_id,kind",
    });
    if (error) return json({ error: error.message }, 500);

    if (kind === "github" && typeof metaIn.githubUsername === "string") {
      await admin
        .from("profiles")
        .update({ github_username: metaIn.githubUsername })
        .eq("id", user.id);
    }

    return json(poolResponse(meta, true));
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});