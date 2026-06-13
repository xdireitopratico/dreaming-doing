/**
 * Vision Node Executor — Extracted from gateway-core.ts (R57)
 */
import { routeLLM, type LLMResponse } from "./llm-router.ts";

export async function executeVisionNode(node: any, input: any, _originalMessage: string, flowId: string): Promise<any> {
  const config = node.data?.config || {};
  const modelId = config.model_id || "gemini-2.5-flash";
  const imageSource = config.image_source || "url";
  const analysisPrompt = config.analysis_prompt || "Analyze this image in detail.";

  let imageUrl: string | null = null;
  if (imageSource === "url") {
    imageUrl = config.image_url || input.image_url || null;
  } else if (imageSource === "base64") {
    imageUrl = config.image_base64 || input.image_base64 || null;
    if (imageUrl && !imageUrl.startsWith("data:")) imageUrl = `data:image/png;base64,${imageUrl}`;
  } else if (imageSource === "input") {
    imageUrl = input.image_url || input.image || input.url || null;
  }

  if (!imageUrl) {
    return { response: "[Vision] Nenhuma imagem fornecida", model: modelId, error: "NO_IMAGE_PROVIDED" };
  }

  const messages: Array<{ role: string; content: any }> = [];
  if (config.system_prompt) messages.push({ role: "system", content: config.system_prompt });
  messages.push({
    role: "user",
    content: [
      { type: "text", text: analysisPrompt },
      { type: "image_url", image_url: { url: imageUrl } },
    ],
  });

  try {
    const result: LLMResponse = await routeLLM({
      model_id: modelId, messages: messages as any,
      temperature: config.temperature ?? 0.3, max_tokens: config.max_tokens ?? 2048,
      tenant_id: flowId,
    });

    return {
      response: result.content, model: result.model, provider: result.provider,
      tokens: { prompt: result.tokens_in, completion: result.tokens_out, total: result.tokens_in + result.tokens_out },
      latency_ms: result.latency_ms, cost_cents: result.cost_cents,
      image_analyzed: true, image_source: imageSource,
    };
  } catch (err: any) {
    console.error(`[Gateway/Vision] Failed for ${modelId}:`, err.message);
    return { response: `[Vision Error] ${err.message}`, model: modelId, error: err.message, cost_cents: 0 };
  }
}
