/**
 * model-catalog-frontend.ts — Frontend mirror of _shared/model-catalog.ts
 * Source of truth for model/provider data in the Builder UI.
 * Keep in sync with supabase/functions/_shared/model-catalog.ts
 * @version 2.0.0 — Round 36 — Full catalog audit
 */

export interface ModelDefinition {
  id: string;
  provider: string;
  modelName: string;
  label: string;
  description: string;
  latency: string;
  tags: string[];
  chatAllowed: boolean;
  opsAllowed: boolean;
  deprecated: boolean;
  maxExpectedLatencyMs: number;
  ram?: string;
  params?: string;
  quality?: "low" | "medium" | "high" | "very-high";
  costPer1kIn?: number;
  costPer1kOut?: number;
  maxContextTokens?: number;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  secretEnvKey: string;
  platformProvided: boolean;
  models: ModelDefinition[];
}

// ═══════════════════════════════════════════════════════════
// ANTHROPIC
// ═══════════════════════════════════════════════════════════

const ANTHROPIC_MODELS: ModelDefinition[] = [
  { id: "anthropic/claude-opus-4-6", provider: "anthropic", modelName: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Qualidade máxima.", latency: "~8-15s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 20000, quality: "very-high", costPer1kIn: 0.015, costPer1kOut: 0.075, maxContextTokens: 200000 },
  { id: "anthropic/claude-sonnet-4-6", provider: "anthropic", modelName: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Equilíbrio profundidade/velocidade.", latency: "~4-8s", tags: ["⭐ Avançado"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.003, costPer1kOut: 0.015, maxContextTokens: 200000 },
  { id: "anthropic/claude-haiku-4-5", provider: "anthropic", modelName: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Rápido e custo menor.", latency: "~2-4s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.0008, costPer1kOut: 0.004, maxContextTokens: 200000 },
];

// ═══════════════════════════════════════════════════════════
// GOOGLE AI (Direct — via GOOGLE_AI_API_KEY)
// ═══════════════════════════════════════════════════════════

const GOOGLE_MODELS: ModelDefinition[] = [
  { id: "google/gemini-2.5-pro", provider: "google", modelName: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Alta qualidade, multimodal, contexto grande.", latency: "~5-10s", tags: ["⭐ Premium", "🖼️ Multimodal"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.00125, costPer1kOut: 0.01, maxContextTokens: 1048576 },
  { id: "google/gemini-3.1-pro-preview", provider: "google", modelName: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", description: "Nova geração, reasoning avançado.", latency: "~5-10s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.00125, costPer1kOut: 0.01, maxContextTokens: 1048576 },
  { id: "google/gemini-3-pro-preview", provider: "google", modelName: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", description: "Nova geração premium.", latency: "~5-10s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.00125, costPer1kOut: 0.01, maxContextTokens: 1048576 },
  { id: "google/gemini-2.5-flash", provider: "google", modelName: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Rápido e multimodal.", latency: "~2-4s", tags: ["⚡", "🖼️ Multimodal"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00015, costPer1kOut: 0.0006, maxContextTokens: 1048576 },
  { id: "google/gemini-3-flash-preview", provider: "google", modelName: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", description: "Nova geração com boa velocidade.", latency: "~2-4s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00015, costPer1kOut: 0.0006, maxContextTokens: 1048576 },
  { id: "google/gemini-2.5-flash-lite", provider: "google", modelName: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Baixa latência e custo reduzido.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 4000, quality: "medium", costPer1kIn: 0.0000375, costPer1kOut: 0.00015, maxContextTokens: 1048576 },
  { id: "google/gemini-3.1-flash-lite-preview", provider: "google", modelName: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview", description: "Preview ultrarrápido.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 4000, quality: "medium", costPer1kIn: 0.0000375, costPer1kOut: 0.00015, maxContextTokens: 1048576 },
];

// ═══════════════════════════════════════════════════════════
// GROQ
// ═══════════════════════════════════════════════════════════

const GROQ_MODELS: ModelDefinition[] = [
  { id: "groq/llama-3.3-70b-versatile", provider: "groq", modelName: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", description: "Alta qualidade, respostas elaboradas.", latency: "~2-5s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "very-high", costPer1kIn: 0.00059, costPer1kOut: 0.00079, maxContextTokens: 131072 },
  { id: "groq/deepseek-r1-distill-llama-70b", provider: "groq", modelName: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B", description: "Raciocínio avançado via Groq.", latency: "~3-6s", tags: ["🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.00075, costPer1kOut: 0.00099, maxContextTokens: 131072 },
  { id: "groq/gpt-oss-120b", provider: "groq", modelName: "openai/gpt-oss-120b", label: "GPT-OSS 120B", description: "Modelo aberto OpenAI 120B via Groq.", latency: "~3-8s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.0004, costPer1kOut: 0.002, maxContextTokens: 131072 },
  { id: "groq/qwen3-32b", provider: "groq", modelName: "qwen/qwen3-32b", label: "Qwen 3 32B", description: "Raciocínio robusto e multilíngue.", latency: "~2-5s", tags: ["🧠 Thinking", "🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00034, costPer1kOut: 0.00034, maxContextTokens: 131072 },
  { id: "groq/llama-4-scout-17b-16e", provider: "groq", modelName: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", description: "MoE nova geração Meta.", latency: "~1-3s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, quality: "high", costPer1kIn: 0.00011, costPer1kOut: 0.00034, maxContextTokens: 131072 },
  { id: "groq/llama-4-maverick-17b-128e", provider: "groq", modelName: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick 17B", description: "MoE 128 experts.", latency: "~2-5s", tags: ["⭐ Avançado"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.0005, costPer1kOut: 0.00077, maxContextTokens: 131072 },
  { id: "groq/gemma2-9b-it", provider: "groq", modelName: "gemma2-9b-it", label: "Gemma 2 9B IT", description: "Bom equilíbrio custo/qualidade.", latency: "~1-3s", tags: ["⚖️ Balanceado"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, quality: "high", costPer1kIn: 0.0002, costPer1kOut: 0.0002, maxContextTokens: 8192 },
  { id: "groq/llama-3.1-8b-instant", provider: "groq", modelName: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", description: "Inferência ultrarrápida.", latency: "~0.5-1.5s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 3000, quality: "medium", costPer1kIn: 0.00005, costPer1kOut: 0.00008, maxContextTokens: 131072 },
  { id: "groq/compound-beta", provider: "groq", modelName: "compound-beta", label: "Compound Beta", description: "Agente com pesquisa e código.", latency: "~3-8s", tags: ["🔍 Search", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },
  { id: "groq/compound-beta-mini", provider: "groq", modelName: "compound-beta-mini", label: "Compound Beta Mini", description: "Agente compacto com pesquisa.", latency: "~2-5s", tags: ["🔍 Search", "⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "medium", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },
];

// ═══════════════════════════════════════════════════════════
// LOVABLE AI (via Lovable Gateway)
// ═══════════════════════════════════════════════════════════

const LOVABLE_MODELS: ModelDefinition[] = [
  { id: "lovable/google/gemini-2.5-pro", provider: "lovable", modelName: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Alta qualidade para tarefas complexas.", latency: "~5-10s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", maxContextTokens: 1048576 },
  { id: "lovable/google/gemini-3.1-pro-preview", provider: "lovable", modelName: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", description: "Nova geração com foco em reasoning.", latency: "~5-10s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", maxContextTokens: 1048576 },
  { id: "lovable/openai/gpt-5", provider: "lovable", modelName: "openai/gpt-5", label: "GPT-5 (via Lovable)", description: "Modelo avançado multimodal.", latency: "~4-10s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", maxContextTokens: 128000 },
  { id: "lovable/openai/gpt-5.2", provider: "lovable", modelName: "openai/gpt-5.2", label: "GPT-5.2 (via Lovable)", description: "Raciocínio avançado.", latency: "~5-12s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 18000, quality: "very-high", maxContextTokens: 128000 },
  { id: "lovable/google/gemini-2.5-flash", provider: "lovable", modelName: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Rápido e multimodal.", latency: "~2-4s", tags: ["⚡", "🖼️ Multimodal"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", maxContextTokens: 1048576 },
  { id: "lovable/google/gemini-3-flash-preview", provider: "lovable", modelName: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview", description: "Nova geração com boa velocidade.", latency: "~2-4s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", maxContextTokens: 1048576 },
  { id: "lovable/openai/gpt-5-mini", provider: "lovable", modelName: "openai/gpt-5-mini", label: "GPT-5 Mini (via Lovable)", description: "Boa precisão com menor custo.", latency: "~2-5s", tags: [], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", maxContextTokens: 128000 },
  { id: "lovable/google/gemini-2.5-flash-lite", provider: "lovable", modelName: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Baixa latência e custo reduzido.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 4000, quality: "medium", maxContextTokens: 1048576 },
  { id: "lovable/openai/gpt-5-nano", provider: "lovable", modelName: "openai/gpt-5-nano", label: "GPT-5 Nano (via Lovable)", description: "Ultrarrápido para cargas leves.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 4000, quality: "medium", maxContextTokens: 128000 },
  { id: "lovable/google/gemini-3-pro-image-preview", provider: "lovable", modelName: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", description: "Geração de imagens.", latency: "~5-15s", tags: ["🖼️ Imagem"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 20000, quality: "high", maxContextTokens: 1048576 },
  { id: "lovable/google/gemini-3.1-flash-image-preview", provider: "lovable", modelName: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image", description: "Geração rápida de imagens.", latency: "~3-8s", tags: ["🖼️ Imagem", "⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "high", maxContextTokens: 1048576 },
];

// ═══════════════════════════════════════════════════════════
// NVIDIA NIM
// ═══════════════════════════════════════════════════════════

const NVIDIA_MODELS: ModelDefinition[] = [
  { id: "nvidia/qwen3.5-397b-a17b", provider: "nvidia", modelName: "qwen/qwen3.5-397b-a17b", label: "Qwen 3.5 397B (NIM)", description: "MoE 397B, raciocínio avançado.", latency: "~3-8s", tags: ["⭐ Premium", "🧠 Thinking", "🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, params: "397B (17B ativos)", quality: "very-high", maxContextTokens: 131072 },
  { id: "nvidia/nemotron-3-super-120b-a12b", provider: "nvidia", modelName: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B (NIM)", description: "Raciocínio profundo e análise técnica.", latency: "~3-8s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, params: "120B (12B ativos)", quality: "very-high", maxContextTokens: 32768 },
  { id: "nvidia/nemotron-3-nano-30b-a3b", provider: "nvidia", modelName: "nvidia/nemotron-3-nano-30b-a3b", label: "Nemotron 3 Nano 30B (NIM)", description: "MoE 30B (3.5B ativos), raciocínio compacto.", latency: "~1-3s", tags: ["⚡", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, params: "30B (3.5B ativos)", quality: "high", maxContextTokens: 32768 },
];

// ═══════════════════════════════════════════════════════════
// OLLAMA (Local VPS)
// ═══════════════════════════════════════════════════════════

const OLLAMA_MODELS: ModelDefinition[] = [
  { id: "ollama/qwen3:14b", provider: "ollama", modelName: "qwen3:14b", label: "Qwen 3 14B", description: "Raciocínio robusto e ótima qualidade PT-BR.", latency: "~20-35s", tags: ["⭐ Avançado", "🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 40000, ram: "~12-14 GB", params: "14B", quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "ollama/deepseek-r1:14b", provider: "ollama", modelName: "deepseek-r1:14b", label: "DeepSeek R1 14B", description: "Raciocínio avançado para decisões complexas.", latency: "~20-35s", tags: ["🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 40000, ram: "~12-14 GB", params: "14B", quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 16384 },
  { id: "ollama/ministral-3:14b", provider: "ollama", modelName: "ministral-3:14b", label: "Ministral 3 14B", description: "Redação formal e análise documental.", latency: "~20-35s", tags: ["⚖️ Jurídico"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 40000, ram: "~12-14 GB", params: "14B", quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "ollama/gemma3:12b", provider: "ollama", modelName: "gemma3:12b", label: "Gemma 3 12B", description: "Escrita formal e entendimento semântico.", latency: "~15-25s", tags: ["📚 Qualidade"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 30000, ram: "~10-12 GB", params: "12B", quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 8192 },
  { id: "ollama/stablelm2:12b", provider: "ollama", modelName: "stablelm2:12b", label: "StableLM 2 12B", description: "Consistência textual em respostas explicativas.", latency: "~15-25s", tags: ["📋 Documentos"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 30000, ram: "~10-12 GB", params: "12B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 4096 },
  { id: "ollama/olmo2:13b", provider: "ollama", modelName: "olmo2:13b", label: "OLMo 2 13B", description: "Modelo aberto para análise contextual.", latency: "~15-25s", tags: ["🔬 Pesquisa"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 32000, ram: "~11-13 GB", params: "13B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 4096 },
  { id: "ollama/qwen3.5:9b", provider: "ollama", modelName: "qwen3.5:9b", label: "Qwen 3.5 9B", description: "Profundidade em tarefas complexas.", latency: "~10-20s", tags: ["🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 25000, ram: "~8-10 GB", params: "9B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "ollama/gemma4", provider: "ollama", modelName: "gemma4", label: "Gemma 4 (e4b)", description: "Última geração Google — multimodal (texto+imagem), 128K contexto.", latency: "~12-20s", tags: ["🏆 Avançado", "🇧🇷 PT-BR", "👁️ Vision"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 25000, ram: "~8-10 GB", params: "e4b", quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },
  { id: "ollama/qwen3:8b", provider: "ollama", modelName: "qwen3:8b", label: "Qwen 3 8B", description: "Equilíbrio qualidade/velocidade para PT-BR.", latency: "~6-10s", tags: ["🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, ram: "~6-8 GB", params: "8B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "ollama/llama3.1:8b", provider: "ollama", modelName: "llama3.1:8b", label: "Llama 3.1 8B", description: "Instruções estáveis e multilíngue.", latency: "~6-10s", tags: ["🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, ram: "~6-8 GB", params: "8B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },
  { id: "ollama/granite3.1-dense:8b", provider: "ollama", modelName: "granite3.1-dense:8b", label: "Granite 3.1 Dense 8B", description: "Precisão instrucional e documentos formais.", latency: "~6-10s", tags: ["⚖️ Jurídico"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, ram: "~6-8 GB", params: "8B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 8192 },
  { id: "ollama/cogito:8b", provider: "ollama", modelName: "cogito:8b", label: "Cogito 8B", description: "Raciocínio e passos de decisão.", latency: "~7-12s", tags: ["🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 14000, ram: "~6-8 GB", params: "8B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 16384 },
  { id: "ollama/deepseek-r1:7b", provider: "ollama", modelName: "deepseek-r1:7b", label: "DeepSeek R1 7B", description: "Raciocínio estruturado com bom custo-benefício.", latency: "~5-8s", tags: ["🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, ram: "~5-7 GB", params: "7B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 16384 },
  { id: "ollama/command-r7b:7b", provider: "ollama", modelName: "command-r7b:7b", label: "Command R7B", description: "Instruções longas e contexto empresarial.", latency: "~5-8s", tags: ["📋 Instruções"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, ram: "~5-7 GB", params: "7B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },
  { id: "ollama/qwen3.5:4b", provider: "ollama", modelName: "qwen3.5:4b", label: "Qwen 3.5 4B", description: "Chat rápido com boa consistência em PT-BR.", latency: "~3-5s", tags: ["⚡", "🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, ram: "~4-5 GB", params: "4B", quality: "medium", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "ollama/gemma3:4b", provider: "ollama", modelName: "gemma3:4b", label: "Gemma 3 4B", description: "Escrita formal consistente.", latency: "~3-6s", tags: ["🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 7000, ram: "~3-5 GB", params: "4.3B", quality: "medium", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 8192 },
  { id: "ollama/phi4-mini:3.8b", provider: "ollama", modelName: "phi4-mini:3.8b", label: "Phi-4 Mini 3.8B", description: "Bom raciocínio para tamanho reduzido.", latency: "~2-4s", tags: ["🧠 Raciocínio"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, ram: "~3-4 GB", params: "3.8B", quality: "medium", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 16384 },
  { id: "ollama/qwen3:30b-a3b", provider: "ollama", modelName: "qwen3:30b-a3b", label: "Qwen 3 30B-A3B (MoE)", description: "MoE 30B com apenas 3B ativos — inteligência grande com RAM mínima.", latency: "~8-15s", tags: ["🧠 Thinking", "🇧🇷 PT-BR", "⚡ MoE"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 20000, ram: "~7 GB", params: "30B (3B ativos)", quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "ollama/gemma2:9b", provider: "ollama", modelName: "gemma2:9b", label: "Gemma 2 9B", description: "Equilíbrio qualidade/eficiência, forte em PT-BR.", latency: "~8-12s", tags: ["⚖️ Balanceado", "🇧🇷 PT-BR"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, ram: "~8 GB", params: "9B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 8192 },
  { id: "ollama/llama3.2:1b", provider: "ollama", modelName: "llama3.2:1b", label: "Llama 3.2 1B", description: "Classificação ultrarrápida.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 3000, ram: "~1-2 GB", params: "1.2B", quality: "low", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 8192 },
  { id: "ollama/minicpm-v", provider: "ollama", modelName: "minicpm-v", label: "MiniCPM-V", description: "Multimodal leve: OCR, leitura de docs e imagens.", latency: "~3-8s", tags: ["👁️ Multimodal", "⚡"], chatAllowed: false, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, ram: "~4-5 GB", params: "3B", quality: "medium", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 4096 },
  { id: "ollama/llava:13b", provider: "ollama", modelName: "llava:13b", label: "LLaVA 13B", description: "Multimodal robusto: análise detalhada de imagens.", latency: "~15-25s", tags: ["👁️ Multimodal", "📚 Qualidade"], chatAllowed: false, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 30000, ram: "~10-13 GB", params: "13B", quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 4096 },
  { id: "ollama/nomic-embed-text-v2-moe", provider: "ollama", modelName: "nomic-embed-text-v2-moe", label: "Nomic Embed v2 MoE", description: "Embeddings semânticos otimizados para RAG e matching contextual.", latency: "<1s", tags: ["🔍 Embedding", "📐 RAG"], chatAllowed: false, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 2000, ram: "~0.5 GB", params: "475M", quality: "medium", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 8192 },
];

// ═══════════════════════════════════════════════════════════
// OPENAI (Direct — via OPENAI_API_KEY)
// ═══════════════════════════════════════════════════════════

const OPENAI_MODELS: ModelDefinition[] = [
  { id: "openai/gpt-5.4", provider: "openai", modelName: "gpt-5.4", label: "GPT-5.4", description: "Modelo mais avançado OpenAI.", latency: "~5-15s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 20000, quality: "very-high", costPer1kIn: 0.005, costPer1kOut: 0.015, maxContextTokens: 128000 },
  { id: "openai/gpt-5.2", provider: "openai", modelName: "gpt-5.2", label: "GPT-5.2", description: "Raciocínio avançado.", latency: "~5-12s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 18000, quality: "very-high", costPer1kIn: 0.005, costPer1kOut: 0.015, maxContextTokens: 128000 },
  { id: "openai/gpt-5", provider: "openai", modelName: "gpt-5", label: "GPT-5", description: "Modelo avançado multimodal.", latency: "~4-10s", tags: ["⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.005, costPer1kOut: 0.015, maxContextTokens: 128000 },
  { id: "openai/gpt-4.1", provider: "openai", modelName: "gpt-4.1", label: "GPT-4.1", description: "Alta qualidade, instrução e código.", latency: "~3-8s", tags: ["⭐ Avançado"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.002, costPer1kOut: 0.008, maxContextTokens: 1047576 },
  { id: "openai/gpt-5-mini", provider: "openai", modelName: "gpt-5-mini", label: "GPT-5 Mini", description: "Boa precisão com menor latência.", latency: "~2-5s", tags: [], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.0003, costPer1kOut: 0.0012, maxContextTokens: 128000 },
  { id: "openai/gpt-5-mini-2025-08-07", provider: "openai", modelName: "gpt-5-mini-2025-08-07", label: "GPT-5 Mini (08/07)", description: "Snapshot específico do GPT-5 Mini.", latency: "~2-5s", tags: [], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.0003, costPer1kOut: 0.0012, maxContextTokens: 128000 },
  { id: "openai/gpt-4.1-mini", provider: "openai", modelName: "gpt-4.1-mini", label: "GPT-4.1 Mini", description: "Equilíbrio custo/qualidade.", latency: "~2-4s", tags: ["⚖️ Balanceado"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.0004, costPer1kOut: 0.0016, maxContextTokens: 1047576 },
  { id: "openai/gpt-5-nano", provider: "openai", modelName: "gpt-5-nano", label: "GPT-5 Nano", description: "Ultrarrápido para cargas leves.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 4000, quality: "medium", costPer1kIn: 0.0001, costPer1kOut: 0.0004, maxContextTokens: 128000 },
  { id: "openai/gpt-4.1-nano", provider: "openai", modelName: "gpt-4.1-nano", label: "GPT-4.1 Nano", description: "Tarefas simples e classificação.", latency: "~1-2s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 4000, quality: "medium", costPer1kIn: 0.0001, costPer1kOut: 0.0004, maxContextTokens: 1047576 },
];

// ═══════════════════════════════════════════════════════════
// OPENROUTER (via OPENROUTER_API_KEY)
// ═══════════════════════════════════════════════════════════

const OPENROUTER_MODELS: ModelDefinition[] = [
  // ═══ TIER 1 — VERY-HIGH (Paid) — ordered strongest→weakest ═══
  { id: "openrouter/mimo-v2-pro", provider: "openrouter", modelName: "xiaomi/mimo-v2-pro", label: "MiMo V2 Pro", description: "Xiaomi top-tier. $1.00/3.00 per M.", latency: "~5-12s", tags: ["💰 $1.00/M", "🔧 Tools", "🧠 Thinking", "⭐ Premium", "📚 1M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 18000, quality: "very-high", costPer1kIn: 0.001, costPer1kOut: 0.003, maxContextTokens: 1048576 },
  { id: "openrouter/glm-5-turbo", provider: "openrouter", modelName: "z-ai/glm-5-turbo", label: "GLM-5 Turbo", description: "Z.ai tool-calling top. $1.20/4.00 per M.", latency: "~3-8s", tags: ["💰 $1.20/M", "🔧 Tools", "⭐ Premium", "📚 202K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.0012, costPer1kOut: 0.004, maxContextTokens: 202752 },
  { id: "openrouter/glm-5.1", provider: "openrouter", modelName: "z-ai/glm-5.1", label: "GLM-5.1", description: "Z.ai latest. $1.40/4.40 per M.", latency: "~3-8s", tags: ["💰 $1.40/M", "🔧 Tools", "⭐ Premium", "📚 203K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.0014, costPer1kOut: 0.0044, maxContextTokens: 203000 },
  { id: "openrouter/glm-5", provider: "openrouter", modelName: "z-ai/glm-5", label: "GLM-5", description: "Z.ai reasoning. $0.72/2.30 per M.", latency: "~4-10s", tags: ["💰 $0.72/M", "🔧 Tools", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.00072, costPer1kOut: 0.0023, maxContextTokens: 80000 },
  { id: "openrouter/deepseek-r1", provider: "openrouter", modelName: "deepseek/deepseek-r1", label: "DeepSeek R1", description: "Reasoning profundo. $0.70/2.50 per M.", latency: "~5-15s", tags: ["💰 $0.70/M", "🧠 Thinking", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 20000, quality: "very-high", costPer1kIn: 0.0007, costPer1kOut: 0.0025, maxContextTokens: 64000 },
  { id: "openrouter/kimi-k2", provider: "openrouter", modelName: "moonshotai/kimi-k2", label: "Kimi K2 Thinking", description: "Moonshot reasoning. $0.57/2.30 per M.", latency: "~5-12s", tags: ["💰 $0.57/M", "🧠 Thinking", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 18000, quality: "very-high", costPer1kIn: 0.00057, costPer1kOut: 0.0023, maxContextTokens: 131072 },
  { id: "openrouter/mimo-v2-omni", provider: "openrouter", modelName: "xiaomi/mimo-v2-omni", label: "MiMo V2 Omni", description: "Xiaomi multimodal. $0.40/2.00 per M.", latency: "~3-8s", tags: ["💰 $0.40/M", "🔧 Tools", "🖼️ Multimodal", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.0004, costPer1kOut: 0.002, maxContextTokens: 262144 },
  { id: "openrouter/deepseek-v3.2-speciale", provider: "openrouter", modelName: "deepseek/deepseek-v3.2-speciale", label: "DeepSeek V3.2 Speciale", description: "DeepSeek thinking reforçado. $0.40/1.20 per M.", latency: "~4-10s", tags: ["💰 $0.40/M", "🔧 Tools", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.0004, costPer1kOut: 0.0012, maxContextTokens: 163840 },
  { id: "openrouter/glm-4.7", provider: "openrouter", modelName: "z-ai/glm-4.7", label: "GLM-4.7 Thinking", description: "Z.ai deep thinking. $0.39/1.75 per M.", latency: "~4-10s", tags: ["💰 $0.39/M", "🧠 Thinking", "📚 202K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0.00039, costPer1kOut: 0.00175, maxContextTokens: 202752 },
  { id: "openrouter/kimi-k2.5", provider: "openrouter", modelName: "moonshotai/kimi-k2.5", label: "Kimi K2.5", description: "Moonshot tool-calling. $0.38/1.72 per M.", latency: "~3-8s", tags: ["💰 $0.38/M", "🔧 Tools", "⭐ Premium", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.00038, costPer1kOut: 0.00172, maxContextTokens: 262144 },
  { id: "openrouter/qwen3.6-plus", provider: "openrouter", modelName: "qwen/qwen3.6-plus", label: "Qwen 3.6 Plus", description: "Qwen latest 1M ctx. $0.325/1.95 per M.", latency: "~3-8s", tags: ["💰 $0.33/M", "🔧 Tools", "🧠 Thinking", "📚 1M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.000325, costPer1kOut: 0.00195, maxContextTokens: 1048576 },
  { id: "openrouter/minimax-m2.7", provider: "openrouter", modelName: "minimax/minimax-m2.7", label: "MiniMax M2.7", description: "MiniMax mais recente. $0.30/1.20 per M.", latency: "~3-6s", tags: ["💰 $0.30/M", "🔧 Tools", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.0003, costPer1kOut: 0.0012, maxContextTokens: 204800 },
  { id: "openrouter/minimax-m2.1", provider: "openrouter", modelName: "minimax/minimax-m2.1", label: "MiniMax M2.1", description: "MiniMax thinking. $0.27/0.95 per M.", latency: "~3-6s", tags: ["💰 $0.27/M", "🔧 Tools", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.00027, costPer1kOut: 0.00095, maxContextTokens: 196608 },
  { id: "openrouter/deepseek-v3.2", provider: "openrouter", modelName: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", description: "Top-tier DeepSeek. $0.26/0.38 per M.", latency: "~3-8s", tags: ["💰 $0.26/M", "🔧 Tools", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.00026, costPer1kOut: 0.00038, maxContextTokens: 163840 },
  { id: "openrouter/gpt-5-mini", provider: "openrouter", modelName: "openai/gpt-5-mini", label: "GPT-5 Mini", description: "GPT-5 mini forte. $0.25/2.00 per M.", latency: "~3-6s", tags: ["💰 $0.25/M", "🔧 Tools", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.00025, costPer1kOut: 0.002, maxContextTokens: 400000 },
  { id: "openrouter/gpt-5.4-nano", provider: "openrouter", modelName: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano", description: "GPT-5.4 reasoning. $0.20/1.25 per M.", latency: "~3-6s", tags: ["💰 $0.20/M", "🔧 Tools", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.0002, costPer1kOut: 0.00125, maxContextTokens: 400000 },
  { id: "openrouter/grok-4.1-fast", provider: "openrouter", modelName: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast", description: "xAI Grok rápido, 2M ctx. $0.20/0.50 per M.", latency: "~2-5s", tags: ["💰 $0.20/M", "🔧 Tools", "⚡ Flash", "📚 2M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "very-high", costPer1kIn: 0.0002, costPer1kOut: 0.0005, maxContextTokens: 2000000 },
  { id: "openrouter/llama-4-maverick", provider: "openrouter", modelName: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", description: "Meta top, 1M ctx. $0.15/0.60 per M.", latency: "~3-8s", tags: ["💰 $0.15/M", "🔧 Tools", "⭐ Premium", "📚 1M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.00015, costPer1kOut: 0.0006, maxContextTokens: 1048576 },
  { id: "openrouter/nemotron-3-super-120b", provider: "openrouter", modelName: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B", description: "NVIDIA 120B MoE. $0.10/0.50 per M.", latency: "~3-8s", tags: ["💰 $0.10/M", "🔧 Tools", "🧠 Thinking", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "very-high", costPer1kIn: 0.0001, costPer1kOut: 0.0005, maxContextTokens: 262144 },
  { id: "openrouter/llama-3.3-70b-instruct", provider: "openrouter", modelName: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", description: "Meta top open-source. $0.10/0.32 per M.", latency: "~3-6s", tags: ["💰 $0.10/M", "🔧 Tools", "⭐ Premium", "📚 131K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.0001, costPer1kOut: 0.00032, maxContextTokens: 131072 },
  { id: "openrouter/mimo-v2-flash", provider: "openrouter", modelName: "xiaomi/mimo-v2-flash", label: "MiMo V2 Flash", description: "Xiaomi 309B MoE. SWE-bench #1 open. $0.09/0.29 per M.", latency: "~2-5s", tags: ["💰 $0.09/M", "🔧 Tools", "🧠 Thinking", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "very-high", costPer1kIn: 0.00009, costPer1kOut: 0.00029, maxContextTokens: 262144 },
  { id: "openrouter/qwen3-235b", provider: "openrouter", modelName: "qwen/qwen3-235b-a22b-2507", label: "Qwen 3 235B MoE", description: "MoE 235B (22B ativos). $0.07/0.10 per M.", latency: "~3-6s", tags: ["💰 $0.07/M", "🔧 Tools", "🧠 Thinking", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.000071, costPer1kOut: 0.0001, maxContextTokens: 262144 },
  { id: "openrouter/gpt-oss-120b", provider: "openrouter", modelName: "openai/gpt-oss-120b", label: "GPT-OSS 120B", description: "OpenAI open 120B MoE. $0.04/0.19 per M.", latency: "~3-6s", tags: ["💰 $0.04/M", "🔧 Tools", "💻 Code", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "very-high", costPer1kIn: 0.000039, costPer1kOut: 0.00019, maxContextTokens: 131072 },

  // ═══ TIER 1 — VERY-HIGH (Free 🆓) ═══
  { id: "openrouter/deepseek-r1-free", provider: "openrouter", modelName: "deepseek/deepseek-r1:free", label: "DeepSeek R1 🆓", description: "Reasoning profundo — GRATUITO.", latency: "~8-20s", tags: ["🆓 Free", "🧠 Thinking", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 25000, quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 64000 },
  { id: "openrouter/qwen3-235b-free", provider: "openrouter", modelName: "qwen/qwen3-235b-a22b-2507:free", label: "Qwen 3 235B 🆓", description: "MoE 235B — GRATUITO.", latency: "~5-10s", tags: ["🆓 Free", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 40960 },
  { id: "openrouter/llama-3.3-70b-free", provider: "openrouter", modelName: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B 🆓", description: "Meta 70B — GRATUITO.", latency: "~5-10s", tags: ["🆓 Free", "🔧 Tools", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "very-high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },

  // ═══ TIER 2 — HIGH (Paid) ═══
  { id: "openrouter/claude-3-haiku", provider: "openrouter", modelName: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", description: "Anthropic Haiku rápido. $0.25/1.25 per M.", latency: "~2-4s", tags: ["💰 $0.25/M", "🔧 Tools", "⚡ Flash"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00025, costPer1kOut: 0.00125, maxContextTokens: 200000 },
  { id: "openrouter/mercury-2", provider: "openrouter", modelName: "inception/mercury-2", label: "Mercury 2", description: "Inception AI rápido. $0.25/0.75 per M.", latency: "~2-5s", tags: ["💰 $0.25/M", "🔧 Tools", "⚡ Flash"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00025, costPer1kOut: 0.00075, maxContextTokens: 128000 },
  { id: "openrouter/deepseek-chat-v3.1", provider: "openrouter", modelName: "deepseek/deepseek-chat-v3.1", label: "DeepSeek Chat V3.1", description: "DeepSeek intermediário. $0.15/0.75 per M.", latency: "~3-6s", tags: ["💰 $0.15/M", "🔧 Tools"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "high", costPer1kIn: 0.00015, costPer1kOut: 0.00075, maxContextTokens: 32768 },
  { id: "openrouter/mistral-small-2603", provider: "openrouter", modelName: "mistralai/mistral-small-2603", label: "Mistral Small 2603", description: "Mistral último, 262K ctx. $0.15/0.60 per M.", latency: "~2-5s", tags: ["💰 $0.15/M", "🔧 Tools"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00015, costPer1kOut: 0.0006, maxContextTokens: 262144 },
  { id: "openrouter/gemma-4-31b", provider: "openrouter", modelName: "google/gemma-4-31b-it", label: "Gemma 4 31B", description: "Google Gemma 4. $0.13/0.40 per M.", latency: "~3-6s", tags: ["💰 $0.13/M", "🔧 Tools", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "high", costPer1kIn: 0.00013, costPer1kOut: 0.0004, maxContextTokens: 262144 },
  { id: "openrouter/gemma-4-26b-moe", provider: "openrouter", modelName: "google/gemma-4-26b-a4b-it", label: "Gemma 4 26B MoE", description: "Google Gemma 4 MoE. $0.13/0.40 per M.", latency: "~2-5s", tags: ["💰 $0.13/M", "🔧 Tools", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00013, costPer1kOut: 0.0004, maxContextTokens: 262144 },
  { id: "openrouter/minimax-m2.5", provider: "openrouter", modelName: "minimax/minimax-m2.5", label: "MiniMax M2.5", description: "MiniMax popular. $0.12/0.99 per M.", latency: "~2-5s", tags: ["💰 $0.12/M", "🔧 Tools"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00012, costPer1kOut: 0.00099, maxContextTokens: 196608 },
  { id: "openrouter/llama-4-scout", provider: "openrouter", modelName: "meta-llama/llama-4-scout", label: "Llama 4 Scout", description: "Meta Llama 4 MoE. $0.11/0.34 per M.", latency: "~2-5s", tags: ["💰 $0.11/M", "🔧 Tools", "📚 131K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00011, costPer1kOut: 0.00034, maxContextTokens: 131072 },
  { id: "openrouter/gemini-2.5-flash-lite", provider: "openrouter", modelName: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Google 1M ctx. $0.10/0.40 per M.", latency: "~2-5s", tags: ["💰 $0.10/M", "🔧 Tools", "⚡ Flash", "📚 1M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.0001, costPer1kOut: 0.0004, maxContextTokens: 1048576 },
  { id: "openrouter/gpt-4.1-nano", provider: "openrouter", modelName: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", description: "OpenAI 1M ctx. $0.10/0.40 per M.", latency: "~2-5s", tags: ["💰 $0.10/M", "🔧 Tools", "📚 1M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.0001, costPer1kOut: 0.0004, maxContextTokens: 1047576 },
  { id: "openrouter/step-3.5-flash", provider: "openrouter", modelName: "stepfun/step-3.5-flash", label: "Step 3.5 Flash", description: "StepFun ultrarrápido. $0.10/0.30 per M.", latency: "~1-3s", tags: ["💰 $0.10/M", "🔧 Tools", "⚡ Flash", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, quality: "high", costPer1kIn: 0.0001, costPer1kOut: 0.0003, maxContextTokens: 262144 },
  { id: "openrouter/mistral-small-3.2", provider: "openrouter", modelName: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", description: "Mistral 24B rápido. $0.09/0.25 per M.", latency: "~2-4s", tags: ["💰 $0.09/M", "🔧 Tools", "⚡ Flash", "📚 256K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00009, costPer1kOut: 0.00025, maxContextTokens: 262144 },
  { id: "openrouter/qwen3-32b", provider: "openrouter", modelName: "qwen/qwen3-32b", label: "Qwen 3 32B", description: "32B Thinking + Tools. $0.08/0.24 per M.", latency: "~2-5s", tags: ["💰 $0.08/M", "🔧 Tools", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.00008, costPer1kOut: 0.00024, maxContextTokens: 40960 },
  { id: "openrouter/gpt-oss-20b", provider: "openrouter", modelName: "openai/gpt-oss-20b", label: "GPT-OSS 20B", description: "OpenAI open 21B MoE. $0.03/0.14 per M.", latency: "~2-4s", tags: ["💰 $0.03/M", "🔧 Tools", "💻 Code"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00003, costPer1kOut: 0.00014, maxContextTokens: 131072 },
  { id: "openrouter/qwen3.5-9b", provider: "openrouter", modelName: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B", description: "Qwen 9B reasoning. $0.05/0.15 per M.", latency: "~2-4s", tags: ["💰 $0.05/M", "🔧 Tools", "🧠 Thinking", "📚 256K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00005, costPer1kOut: 0.00015, maxContextTokens: 262144 },
  { id: "openrouter/gpt-5-nano", provider: "openrouter", modelName: "openai/gpt-5-nano", label: "GPT-5 Nano", description: "GPT-5 compacto. $0.05/0.40 per M.", latency: "~2-4s", tags: ["💰 $0.05/M", "🔧 Tools", "⚡ Flash", "📚 400K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 6000, quality: "high", costPer1kIn: 0.00005, costPer1kOut: 0.0004, maxContextTokens: 400000 },

  // ═══ TIER 2 — HIGH (Free 🆓) ═══
  { id: "openrouter/llama-4-maverick-free", provider: "openrouter", modelName: "meta-llama/llama-4-maverick-17b-128e-instruct:free", label: "Llama 4 Maverick 🆓", description: "Meta MoE 128 experts — GRATUITO.", latency: "~5-10s", tags: ["🆓 Free", "🔧 Tools", "📚 1M Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 1048576 },
  { id: "openrouter/llama-4-scout-free", provider: "openrouter", modelName: "meta-llama/llama-4-scout-17b-16e-instruct:free", label: "Llama 4 Scout 🆓", description: "Meta MoE 16 experts — GRATUITO.", latency: "~3-8s", tags: ["🆓 Free", "🔧 Tools"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 131072 },
  { id: "openrouter/qwen3-32b-free", provider: "openrouter", modelName: "qwen/qwen3-32b:free", label: "Qwen 3 32B 🆓", description: "Qwen 32B — GRATUITO.", latency: "~5-10s", tags: ["🆓 Free", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 40960 },
  { id: "openrouter/deepseek-chat-v3.1-free", provider: "openrouter", modelName: "deepseek/deepseek-chat-v3.1:free", label: "DeepSeek Chat V3.1 🆓", description: "DeepSeek chat — GRATUITO.", latency: "~5-10s", tags: ["🆓 Free"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 32768 },
  { id: "openrouter/gemma-4-31b-free", provider: "openrouter", modelName: "google/gemma-4-31b-it:free", label: "Gemma 4 31B 🆓", description: "Google Gemma 4 — GRATUITO.", latency: "~5-10s", tags: ["🆓 Free", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 262144 },
  { id: "openrouter/gemma-4-26b-moe-free", provider: "openrouter", modelName: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B MoE 🆓", description: "Google Gemma 4 MoE — GRATUITO.", latency: "~3-8s", tags: ["🆓 Free", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 262144 },
  { id: "openrouter/mistral-small-3.2-free", provider: "openrouter", modelName: "mistralai/mistral-small-3.2-24b-instruct:free", label: "Mistral Small 3.2 🆓", description: "Mistral 24B — GRATUITO.", latency: "~3-8s", tags: ["🆓 Free", "🔧 Tools", "📚 262K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "high", costPer1kIn: 0, costPer1kOut: 0, maxContextTokens: 262144 },

  // ═══ TIER 3 — MEDIUM (Paid) ═══
  { id: "openrouter/llama-3.1-8b", provider: "openrouter", modelName: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", description: "Meta 8B. Rápido e barato. $0.02/0.05 per M.", latency: "~1-3s", tags: ["💰 $0.02/M", "🔧 Tools", "⚡ Flash", "📚 131K Ctx"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, quality: "medium", costPer1kIn: 0.00002, costPer1kOut: 0.00005, maxContextTokens: 131072 },
];

// ═══════════════════════════════════════════════════════════
// PERPLEXITY
// ═══════════════════════════════════════════════════════════

const PERPLEXITY_MODELS: ModelDefinition[] = [
  { id: "perplexity/sonar-deep-research", provider: "perplexity", modelName: "sonar-deep-research", label: "Sonar Deep Research", description: "Pesquisa profunda multi-etapa.", latency: "~10-30s", tags: ["🔍 Search", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 35000, quality: "very-high", costPer1kIn: 0.002, costPer1kOut: 0.008, maxContextTokens: 127072 },
  { id: "perplexity/sonar-reasoning-pro", provider: "perplexity", modelName: "sonar-reasoning-pro", label: "Sonar Reasoning Pro", description: "Raciocínio com pesquisa integrada.", latency: "~5-12s", tags: ["🔍 Search", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 18000, quality: "very-high", costPer1kIn: 0.002, costPer1kOut: 0.008, maxContextTokens: 127072 },
  { id: "perplexity/sonar-pro", provider: "perplexity", modelName: "sonar-pro", label: "Sonar Pro", description: "Pesquisa profunda com grounding.", latency: "~5-10s", tags: ["🔍 Search", "⭐ Premium"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 15000, quality: "high", costPer1kIn: 0.003, costPer1kOut: 0.015, maxContextTokens: 127072 },
  { id: "perplexity/sonar-reasoning", provider: "perplexity", modelName: "sonar-reasoning", label: "Sonar Reasoning", description: "Raciocínio com pesquisa.", latency: "~4-8s", tags: ["🔍 Search", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 12000, quality: "high", costPer1kIn: 0.001, costPer1kOut: 0.005, maxContextTokens: 127072 },
  { id: "perplexity/sonar", provider: "perplexity", modelName: "sonar", label: "Sonar", description: "Busca com resposta contextual.", latency: "~3-6s", tags: ["🔍 Search"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 10000, quality: "high", costPer1kIn: 0.001, costPer1kOut: 0.001, maxContextTokens: 127072 },
];

// ═══════════════════════════════════════════════════════════
// xAI (GROK)
// ═══════════════════════════════════════════════════════════

const XAI_MODELS: ModelDefinition[] = [
  { id: "xai/grok-4.20-multi-agent-0309", provider: "xai", modelName: "grok-4.20-multi-agent-0309", label: "Grok 4.20 Multi-Agent", description: "Orquestração multi-agente.", latency: "~5-15s", tags: ["⭐ Premium", "🤖 Agentes"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 20000, quality: "very-high", costPer1kIn: 0.002, costPer1kOut: 0.006, maxContextTokens: 2000000 },
  { id: "xai/grok-4.20-0309-reasoning", provider: "xai", modelName: "grok-4.20-0309-reasoning", label: "Grok 4.20 Reasoning", description: "Raciocínio analítico chain-of-thought.", latency: "~5-12s", tags: ["⭐ Premium", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 18000, quality: "very-high", costPer1kIn: 0.002, costPer1kOut: 0.006, maxContextTokens: 2000000 },
  { id: "xai/grok-4.20-0309-non-reasoning", provider: "xai", modelName: "grok-4.20-0309-non-reasoning", label: "Grok 4.20 Fast", description: "Respostas rápidas sem raciocínio extenso.", latency: "~2-5s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "very-high", costPer1kIn: 0.002, costPer1kOut: 0.006, maxContextTokens: 2000000 },
  { id: "xai/grok-4-1-fast-reasoning", provider: "xai", modelName: "grok-4-1-fast-reasoning", label: "Grok 4.1 Fast Reasoning", description: "Versão rápida com raciocínio.", latency: "~2-5s", tags: ["⚡", "🧠 Thinking"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 8000, quality: "high", costPer1kIn: 0.0002, costPer1kOut: 0.0005, maxContextTokens: 2000000 },
  { id: "xai/grok-4-1-fast-non-reasoning", provider: "xai", modelName: "grok-4-1-fast-non-reasoning", label: "Grok 4.1 Fast", description: "Versão rápida sem raciocínio.", latency: "~1-3s", tags: ["⚡"], chatAllowed: true, opsAllowed: true, deprecated: false, maxExpectedLatencyMs: 5000, quality: "high", costPer1kIn: 0.0002, costPer1kOut: 0.0005, maxContextTokens: 2000000 },
];

// ═══════════════════════════════════════════════════════════
// PROVIDERS REGISTRY — Alphabetical order
// ═══════════════════════════════════════════════════════════

export const PROVIDERS: ProviderDefinition[] = [
  { id: "anthropic", label: "Anthropic", color: "amber", badgeBg: "bg-amber-500/15", badgeText: "text-amber-600", secretEnvKey: "ANTHROPIC_API_KEY", platformProvided: false, models: ANTHROPIC_MODELS },
  { id: "google", label: "Google AI", color: "sky", badgeBg: "bg-sky-500/15", badgeText: "text-sky-600", secretEnvKey: "GOOGLE_AI_API_KEY", platformProvided: true, models: GOOGLE_MODELS },
  { id: "groq", label: "Groq", color: "green", badgeBg: "bg-green-500/15", badgeText: "text-green-600", secretEnvKey: "GROQ_API_KEY", platformProvided: true, models: GROQ_MODELS },
  { id: "lovable", label: "Lovable AI", color: "pink", badgeBg: "bg-pink-500/15", badgeText: "text-pink-600", secretEnvKey: "LOVABLE_API_KEY", platformProvided: true, models: LOVABLE_MODELS },
  { id: "nvidia", label: "NVIDIA NIM", color: "lime", badgeBg: "bg-lime-500/15", badgeText: "text-lime-600", secretEnvKey: "NVIDIA_QWEN35_397B_A17B_API_KEY", platformProvided: true, models: NVIDIA_MODELS },
  { id: "ollama", label: "Ollama (Local)", color: "emerald", badgeBg: "bg-emerald-500/15", badgeText: "text-emerald-600", secretEnvKey: "", platformProvided: true, models: OLLAMA_MODELS },
  { id: "openai", label: "OpenAI", color: "violet", badgeBg: "bg-violet-500/15", badgeText: "text-violet-600", secretEnvKey: "OPENAI_API_KEY", platformProvided: true, models: OPENAI_MODELS },
  { id: "openrouter", label: "OpenRouter", color: "orange", badgeBg: "bg-orange-500/15", badgeText: "text-orange-600", secretEnvKey: "OPENROUTER_API_KEY", platformProvided: false, models: OPENROUTER_MODELS },
  { id: "perplexity", label: "Perplexity", color: "teal", badgeBg: "bg-teal-500/15", badgeText: "text-teal-600", secretEnvKey: "PERPLEXITY_API_KEY", platformProvided: false, models: PERPLEXITY_MODELS },
  { id: "xai", label: "xAI (Grok)", color: "blue", badgeBg: "bg-blue-500/15", badgeText: "text-blue-600", secretEnvKey: "XAI_API_KEY", platformProvided: true, models: XAI_MODELS },
];

export const ALL_MODELS: ModelDefinition[] = PROVIDERS.flatMap((p) => p.models);

export function findModel(fullId: string): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.id === fullId);
}

export function findProvider(providerId: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === providerId);
}

export function getProviderForModel(modelId: string): ProviderDefinition | undefined {
  const model = findModel(modelId);
  if (!model) return undefined;
  return findProvider(model.provider);
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  ALL_MODELS.forEach((m) => m.tags.forEach((t) => tags.add(t)));
  return Array.from(tags).sort();
}
