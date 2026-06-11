import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

/** Sincroniza JWT do usuário com o Realtime (obrigatório com RLS em realtime.messages). */
export async function syncSupabaseRealtimeAuth(accessToken: string | null) {
  if (!isSupabaseConfigured()) return;
  try {
    if (accessToken) {
      await supabase.realtime.setAuth(accessToken);
    } else {
      await supabase.realtime.setAuth(null);
    }
  } catch (e) {
    console.warn("[FORGE Realtime] setAuth falhou:", e);
  }
}

export type PostgresChangeHandler = (payload: {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => void;

type SubscribeOpts = {
  channelName: string;
  table: string;
  filter?: string;
  onChange: PostgresChangeHandler;
  onStatus?: (status: string, err?: Error) => void;
};

/** Inscreve em postgres_changes com log de status (debug de quebras). */
export function subscribePostgresChanges(opts: SubscribeOpts): RealtimeChannel | null {
  if (!isSupabaseConfigured()) {
    opts.onStatus?.("SKIPPED", new Error("Supabase não configurado"));
    return null;
  }

  const channel = supabase
    .channel(opts.channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: opts.table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      },
      (payload) => {
        opts.onChange({
          eventType: payload.eventType,
          new: (payload.new ?? {}) as Record<string, unknown>,
          old: (payload.old ?? {}) as Record<string, unknown>,
        });
      },
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[FORGE Realtime] ${opts.channelName} → ${status}`, err);
      }
      opts.onStatus?.(status, err);
    });

  return channel;
}

export function removeRealtimeChannel(channel: RealtimeChannel | null) {
  if (channel) void supabase.removeChannel(channel);
}
