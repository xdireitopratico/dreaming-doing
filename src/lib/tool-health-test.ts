import { supabase } from "@/integrations/supabase/client";

export type ToolHealthStatus = "healthy" | "degraded" | "unhealthy" | "idle" | "testing";

export interface ToolHealthResult {
  toolName: string;
  health: ToolHealthStatus;
  status?: string;
  error?: string | null;
  durationMs?: number;
}

export async function testToolHealth(
  flowId: string,
  toolName: string,
  toolInput?: Record<string, unknown>,
): Promise<ToolHealthResult> {
  const { data, error } = await supabase.functions.invoke("aetherforge-gateway", {
    body: {
      action: "test_tool",
      flow_id: flowId,
      tool_name: toolName,
      ...(toolInput ? { tool_input: toolInput } : {}),
    },
  });

  if (error) {
    return {
      toolName,
      health: "unhealthy",
      error: error.message,
    };
  }

  const payload = data as {
    health?: ToolHealthStatus;
    status?: string;
    error?: string | null;
    duration_ms?: number;
  };

  return {
    toolName,
    health: payload.health || "unhealthy",
    status: payload.status,
    error: payload.error,
    durationMs: payload.duration_ms,
  };
}