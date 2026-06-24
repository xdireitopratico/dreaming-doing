import { supabase } from "@/integrations/supabase/client";
import {
  providerDefinitionFor,
  type ToolConnectorKind,
} from "@/lib/tool-connectors";
import { assertEdgeFunctionOk } from "@/lib/edge-function-response";

export type ToolConnectorUpsertResult = {
  ok?: boolean;
  error?: string;
  connected?: boolean;
  poolCount?: number;
  poolSlots?: Array<{ id: string; hint: string; addedAt: string }>;
};

export async function saveToolConnector(opts: {
  kind: ToolConnectorKind;
  provider: string;
  token?: string;
  baseUrl?: string;
  label?: string;
  meta?: Record<string, unknown>;
}) {
  const def = providerDefinitionFor(opts.kind, opts.provider);
  const body: Record<string, unknown> = {
    kind: opts.kind,
    meta: {
      provider: opts.provider,
      label: opts.label ?? def?.label ?? opts.provider,
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl.trim().replace(/\/$/, "") } : {}),
      ...(opts.meta ?? {}),
    },
  };

  const token = opts.token?.trim();
  if (token) body.token = token;
  const { data, error, response } = await supabase.functions.invoke("connector-upsert", { body });
  const res = await assertEdgeFunctionOk(
    data as ToolConnectorUpsertResult | null,
    error,
    undefined,
    response,
  );
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function disconnectToolConnector(opts: {
  kind: ToolConnectorKind;
  provider?: string;
  baseUrl?: string;
}) {
  const body: Record<string, unknown> = {
    kind: opts.kind,
    disconnect: true,
  };
  if (opts.provider) {
    body.meta = { provider: opts.provider, ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) };
  }
  const { data, error, response } = await supabase.functions.invoke("connector-upsert", { body });
  const res = await assertEdgeFunctionOk(
    data as { error?: string } | null,
    error,
    undefined,
    response,
  );
  if (res?.error) throw new Error(res.error);
}
