/** Normaliza `messages.parts` (DB) → conteúdo para o LLM. */

import { parseFileBlobPart } from "./attachment-parse.ts";

export type DbMessagePart = {
  type?: string;
  text?: string;
  name?: string;
  mimeType?: string;
  dataBase64?: string;
};

const VISION_MODEL_HINT =
  /gpt-4o|gpt-4\.1|gpt-5|o1|o3|claude-3|claude-sonnet-4|claude-opus-4|gemini-2\.|gemini-3|grok-2-vision|llava|vision|pixtral|qwen-vl/i;

export function modelIdSupportsVision(modelId: string): boolean {
  return VISION_MODEL_HINT.test(modelId);
}

export async function expandPartsToUserContent(
  parts: DbMessagePart[] | undefined,
  options: { visionCapable: boolean; modelHint?: string },
): Promise<string> {
  if (!parts?.length) return "";

  const visionOk = options.visionCapable || modelIdSupportsVision(options.modelHint ?? "");
  const textBlocks: string[] = [];
  const imageNotes: string[] = [];

  for (const p of parts) {
    if (p.type === "text" && p.text?.trim()) {
      textBlocks.push(p.text.trim());
      continue;
    }

    if (p.type === "image" && p.dataBase64) {
      if (visionOk) {
        imageNotes.push(
          `[Imagem anexada: ${p.name ?? "image"} — enviada ao modelo com visão (${p.mimeType ?? "image"})]`,
        );
      } else {
        imageNotes.push(
          `[Imagem: ${p.name ?? "image"} — o modelo ativo não tem visão. Descreva o que precisa ou troque o modelo em /models.]`,
        );
      }
      continue;
    }

    if (p.type === "file_blob" && p.dataBase64 && p.name) {
      const extracted = await parseFileBlobPart({
        type: "file_blob",
        name: p.name,
        mimeType: p.mimeType ?? "application/octet-stream",
        dataBase64: p.dataBase64,
      });
      textBlocks.push(`--- Documento: ${p.name} ---\n${extracted}`);
    }
  }

  return [...textBlocks, ...imageNotes].filter(Boolean).join("\n\n");
}

/** Conteúdo multimodal OpenAI-compatible (quando há imagem + visão). */
export async function expandPartsToOpenAIContent(
  parts: DbMessagePart[] | undefined,
  options: { visionCapable: boolean; modelHint?: string },
): Promise<string | Array<{ type: string; text?: string; image_url?: { url: string } }>> {
  const visionOk = options.visionCapable || modelIdSupportsVision(options.modelHint ?? "");
  const images = (parts ?? []).filter((p) => p.type === "image" && p.dataBase64);

  if (!visionOk || images.length === 0) {
    const text = await expandPartsToUserContent(parts, options);
    return text;
  }

  const blocks: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  const text = await expandPartsToUserContent(
    (parts ?? []).filter((p) => p.type !== "image"),
    { ...options, visionCapable: false },
  );
  if (text.trim()) blocks.push({ type: "text", text: text.trim() });

  for (const img of images) {
    const mime = img.mimeType ?? "image/png";
    const url = `data:${mime};base64,${img.dataBase64}`;
    blocks.push({ type: "image_url", image_url: { url } });
  }

  return blocks.length === 1 && blocks[0].type === "text" ? (blocks[0].text ?? "") : blocks;
}
