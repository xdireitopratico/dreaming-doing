/**
 * Context Window Manager — AetherForge Round 36
 * 
 * Monitors token count per model and compresses messages when > 80% of limit.
 * Strategy: summarize old messages + keep last 5 recent messages.
 * 
 * @version 1.0.0
 */

import { resolveModelForAPI } from "./model-catalog.ts";

// ═══════════════════════════════════════════════════════════
// TOKEN ESTIMATION
// ═══════════════════════════════════════════════════════════

/** Rough token estimate: ~4 chars per token for English, ~3 for PT-BR */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // More conservative estimate for multilingual content
  return Math.ceil(text.length / 3.5);
}

function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((total, msg) => {
    // Each message has ~4 tokens overhead (role, formatting)
    return total + 4 + estimateTokens(msg.content);
  }, 3); // 3 tokens for priming
}

// ═══════════════════════════════════════════════════════════
// DEFAULT CONTEXT LIMITS
// ═══════════════════════════════════════════════════════════

/** Fallback context limit when model doesn't specify maxContextTokens */
const DEFAULT_CONTEXT_LIMIT = 8192;

/** Threshold ratio — compress when usage exceeds this fraction */
const COMPRESSION_THRESHOLD = 0.80;

/** Number of recent messages to always preserve (never compress) */
const KEEP_RECENT_MESSAGES = 5;

// ═══════════════════════════════════════════════════════════
// COMPRESSION
// ═══════════════════════════════════════════════════════════

export interface ContextWindowResult {
  messages: Array<{ role: string; content: string }>;
  wasCompressed: boolean;
  originalTokens: number;
  compressedTokens: number;
  maxContextTokens: number;
  compressionRatio: number;
}

/**
 * Manage context window: if messages exceed 80% of model's max context,
 * compress older messages into a summary while preserving recent ones.
 * 
 * @param modelId - The full model ID (e.g. "groq/llama-3.1-8b-instant")
 * @param messages - Current message array
 * @param reserveForOutput - Tokens to reserve for model output (default: max_tokens or 1024)
 */
export function manageContextWindow(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  reserveForOutput: number = 1024,
): ContextWindowResult {
  // 1. Resolve max context from catalog
  const resolved = resolveModelForAPI(modelId);
  const maxContextTokens = resolved?.definition?.maxContextTokens || DEFAULT_CONTEXT_LIMIT;
  
  // 2. Estimate current token usage
  const originalTokens = estimateMessagesTokens(messages);
  const availableTokens = maxContextTokens - reserveForOutput;
  
  // 3. Check if compression is needed
  if (originalTokens <= availableTokens * COMPRESSION_THRESHOLD) {
    return {
      messages,
      wasCompressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      maxContextTokens,
      compressionRatio: 1.0,
    };
  }
  
  console.log(`[context-window] ⚠️ Token usage ${originalTokens}/${availableTokens} (${Math.round(originalTokens/availableTokens*100)}%) exceeds ${COMPRESSION_THRESHOLD*100}% threshold for ${modelId}`);
  
  // 4. Separate system message (always preserved), old messages, and recent messages
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");
  
  // Keep last N messages intact
  const recentMessages = nonSystemMessages.slice(-KEEP_RECENT_MESSAGES);
  const oldMessages = nonSystemMessages.slice(0, -KEEP_RECENT_MESSAGES);
  
  if (oldMessages.length === 0) {
    // Nothing to compress — only recent messages + system
    return {
      messages,
      wasCompressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      maxContextTokens,
      compressionRatio: 1.0,
    };
  }
  
  // 5. Create a compressed summary of old messages
  const summary = compressMessages(oldMessages);
  
  // 6. Reconstruct messages: system + summary + recent
  const compressedMessages: Array<{ role: string; content: string }> = [
    ...systemMessages,
    { role: "system", content: `[Resumo do contexto anterior]\n${summary}` },
    ...recentMessages,
  ];
  
  const compressedTokens = estimateMessagesTokens(compressedMessages);
  
  console.log(`[context-window] ✅ Compressed: ${originalTokens} → ${compressedTokens} tokens (${Math.round(compressedTokens/originalTokens*100)}%)`);
  
  return {
    messages: compressedMessages,
    wasCompressed: true,
    originalTokens,
    compressedTokens,
    maxContextTokens,
    compressionRatio: compressedTokens / originalTokens,
  };
}

/**
 * Simple extractive compression: takes key sentences from old messages.
 * For production, this would delegate to a cheap LLM for abstractive summarization.
 */
function compressMessages(messages: Array<{ role: string; content: string }>): string {
  const parts: string[] = [];
  
  for (const msg of messages) {
    const content = msg.content.trim();
    if (!content) continue;
    
    // Extract first sentence or first 150 chars, whichever is shorter
    const firstSentence = content.match(/^[^.!?]+[.!?]/)?.[0] || content.substring(0, 150);
    const roleLabel = msg.role === "user" ? "Usuário" : msg.role === "assistant" ? "Assistente" : msg.role;
    parts.push(`- ${roleLabel}: ${firstSentence.trim()}`);
  }
  
  return parts.join("\n");
}

/**
 * Get context window info for a model (used by frontend for display)
 */
export function getContextWindowInfo(modelId: string): {
  maxContextTokens: number;
  label: string;
} {
  const resolved = resolveModelForAPI(modelId);
  const maxTokens = resolved?.definition?.maxContextTokens || DEFAULT_CONTEXT_LIMIT;
  
  if (maxTokens >= 1000000) return { maxContextTokens: maxTokens, label: `${Math.round(maxTokens/1000)}K` };
  if (maxTokens >= 100000) return { maxContextTokens: maxTokens, label: `${Math.round(maxTokens/1000)}K` };
  if (maxTokens >= 1000) return { maxContextTokens: maxTokens, label: `${Math.round(maxTokens/1000)}K` };
  return { maxContextTokens: maxTokens, label: `${maxTokens}` };
}
