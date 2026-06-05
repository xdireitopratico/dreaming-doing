/** Rótulo correto do provedor (OpenAI-compatible ≠ OpenAI). */

export function llmApiErrorLabel(baseUrl: string): string {
  const u = baseUrl.toLowerCase();
  if (u.includes("integrate.api.nvidia.com")) return "NVIDIA NIM";
  if (u.includes("api.groq.com")) return "Groq";
  if (u.includes("api.x.ai")) return "xAI";
  if (u.includes("openrouter.ai")) return "OpenRouter";
  if (u.includes("api.deepseek.com")) return "DeepSeek";
  if (u.includes("dashscope.aliyuncs.com")) return "DashScope";
  if (u.includes("api.minimax.io")) return "MiniMax";
  if (u.includes("api.moonshot.ai")) return "Moonshot";
  if (u.includes("api.xiaomimimo.com")) return "MiMo";
  if (u.includes("generativelanguage.googleapis.com")) return "Gemini";
  if (u.includes("api.anthropic.com")) return "Anthropic";
  if (u.includes("api.openai.com")) return "OpenAI";
  return "LLM";
}

export function formatLlmApiError(
  baseUrl: string,
  status: number,
  body: string,
): string {
  return `${llmApiErrorLabel(baseUrl)} API error ${status}: ${body.slice(0, 300)}`;
}