/**
 * Minimal payloads for tool health checks (editor + smoke)
 */
export const TOOL_HEALTH_PAYLOADS: Record<string, Record<string, unknown>> = {
  web_scrape: { url: "https://example.com", provider: "auto" },
  web_research: { query: "open source software", limit: 3 },
  http_request: { url: "https://example.com", method: "GET" },
  condition_eval: { expression: "true", variables: {} },
  email_send: {
    to: "delivered@resend.dev",
    subject: "Tool health check",
    text: "Health check ping",
    from: "onboarding@resend.dev",
  },
};

export function getToolHealthPayload(toolName: string): Record<string, unknown> {
  return { ...(TOOL_HEALTH_PAYLOADS[toolName] || { ping: true }) };
}

export function classifyToolHealthResult(toolName: string, result: {
  status?: string;
  error?: string;
  result?: Record<string, unknown>;
}): "healthy" | "degraded" | "unhealthy" {
  const err = result.error || "";
  if (err.includes("not found in registry") || err.includes("Unauthorized") || err.includes("web-research-tools")) {
    return "unhealthy";
  }
  if (result.status === "success") return "healthy";
  if (toolName === "email_send" && err.includes("Resend error")) return "degraded";
  if (toolName === "web_scrape" && result.status === "success") return "healthy";
  if (err) return "degraded";
  return "unhealthy";
}