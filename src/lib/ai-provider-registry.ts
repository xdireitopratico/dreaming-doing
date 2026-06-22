/**
 * Registry unificado de providers de IA.
 *
 * Fonte de verdade para metadados de providers (nome, ícone, prefixo de chave,
 * URL de docs, base URL OpenAI-compatible, suporte a pool, model presets).
 *
 * Providers built-in são declarados aqui. Providers adicionados pelo usuário
 * vivem no LocalStorage e são mergeados em runtime.
 */
import {
  Brain,
  Box,
  Cpu,
  Gem,
  Globe,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ForgeModelPreset, ModelTier } from "@/lib/model-catalog";

export type BuiltInProviderId =
  | "alibaba"
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "groq"
  | "minimax"
  | "moonshotai"
  | "nvidia"
  | "ollama"
  | "openai"
  | "openrouter"
  | "xai"
  | "xiaomi";

export type CustomProviderId = `custom-${string}`;
export type AiProviderId = BuiltInProviderId | CustomProviderId;

export type AiProviderIcon = "brain" | "zap" | "gem" | "globe" | "cpu" | "box";

export interface AiProvider {
  id: AiProviderId;
  label: string;
  icon: AiProviderIcon;
  docUrl: string;
  /** Prefixo sugerido para a chave (ex.: sk-proj-) */
  keyPrefix: string;
  /** Placeholder do input de chave */
  keyPlaceholder: string;
  /** Custo aproximado por 1M tokens (0 = gratuito/não listar) */
  costPerM: number;
  /** Se o provider é compatível com OpenAI (a grande maioria) */
  openAiCompatible: boolean;
  /** Se permite pool de chaves (ROBIN) */
  supportsPool: boolean;
  /** Base URL para providers OpenAI-compatible. */
  baseUrl: string;
  /** Se foi adicionado pelo usuário via UI */
  isUserAdded?: boolean;
  /** Modelos pré-carregados do catálogo para este provider */
  models: ForgeModelPreset[];
}

export interface CustomProviderInput {
  label: string;
  baseUrl: string;
  keyPrefix?: string;
  keyPlaceholder?: string;
}

const ICON_MAP: Record<AiProviderIcon, LucideIcon> = {
  brain: Brain,
  zap: Zap,
  gem: Gem,
  globe: Globe,
  cpu: Cpu,
  box: Box,
};

export function providerIcon(id: AiProviderIcon): LucideIcon {
  return ICON_MAP[id];
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function buildProvider(p: Omit<AiProvider, "models"> & { models?: ForgeModelPreset[] }): AiProvider {
  return { ...p, models: p.models ?? [] };
}

export const BUILT_IN_PROVIDERS: AiProvider[] = [
  buildProvider({
    id: "alibaba",
    label: "Alibaba (DashScope)",
    icon: "globe",
    docUrl: "https://dashscope.console.aliyun.com",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    costPerM: 0.5,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  }),
  buildProvider({
    id: "anthropic",
    label: "Anthropic",
    icon: "zap",
    docUrl: "https://console.anthropic.com",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-...",
    costPerM: 3,
    openAiCompatible: false,
    supportsPool: false,
    baseUrl: "https://api.anthropic.com",
  }),
  buildProvider({
    id: "deepseek",
    label: "DeepSeek",
    icon: "brain",
    docUrl: "https://platform.deepseek.com",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    costPerM: 0.2,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://api.deepseek.com",
  }),
  buildProvider({
    id: "gemini",
    label: "Google Gemini",
    icon: "gem",
    docUrl: "https://aistudio.google.com/apikey",
    keyPrefix: "AIza",
    keyPlaceholder: "AIza...",
    costPerM: 1.25,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  }),
  buildProvider({
    id: "groq",
    label: "Groq",
    icon: "cpu",
    docUrl: "https://console.groq.com",
    keyPrefix: "gsk_",
    keyPlaceholder: "gsk_...",
    costPerM: 0,
    openAiCompatible: true,
    supportsPool: true,
    baseUrl: "https://api.groq.com/openai/v1",
  }),
  buildProvider({
    id: "minimax",
    label: "MiniMax",
    icon: "brain",
    docUrl: "https://platform.minimax.io",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    costPerM: 0.3,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://api.minimax.io/v1",
  }),
  buildProvider({
    id: "moonshotai",
    label: "Moonshot (Kimi)",
    icon: "globe",
    docUrl: "https://platform.kimi.ai",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    costPerM: 0.4,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://api.moonshot.ai/v1",
  }),
  buildProvider({
    id: "nvidia",
    label: "NVIDIA NIM",
    icon: "cpu",
    docUrl: "https://build.nvidia.com",
    keyPrefix: "nvapi-",
    keyPlaceholder: "nvapi-...",
    costPerM: 0,
    openAiCompatible: true,
    supportsPool: true,
    baseUrl: "https://integrate.api.nvidia.com/v1",
  }),
  buildProvider({
    id: "ollama",
    label: "Ollama (local)",
    icon: "cpu",
    docUrl: "https://github.com/ollama/ollama/blob/main/docs/faq.md",
    keyPrefix: "http",
    keyPlaceholder: "URL + chave opcional",
    costPerM: 0,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "http://localhost:11434/v1",
  }),
  buildProvider({
    id: "openai",
    label: "OpenAI",
    icon: "brain",
    docUrl: "https://platform.openai.com",
    keyPrefix: "sk-proj-",
    keyPlaceholder: "sk-proj-...",
    costPerM: 2.5,
    openAiCompatible: true,
    supportsPool: true,
    baseUrl: "https://api.openai.com/v1",
  }),
  buildProvider({
    id: "openrouter",
    label: "OpenRouter",
    icon: "globe",
    docUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
    keyPlaceholder: "sk-or-...",
    costPerM: 0,
    openAiCompatible: true,
    supportsPool: true,
    baseUrl: OPENROUTER_BASE,
  }),
  buildProvider({
    id: "xai",
    label: "xAI (Grok)",
    icon: "globe",
    docUrl: "https://console.x.ai",
    keyPrefix: "xai-",
    keyPlaceholder: "xai-...",
    costPerM: 0.5,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://api.x.ai/v1",
  }),
  buildProvider({
    id: "xiaomi",
    label: "Xiaomi (MiMo)",
    icon: "box",
    docUrl: "https://platform.xiaomimimo.com",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    costPerM: 0.3,
    openAiCompatible: true,
    supportsPool: false,
    baseUrl: "https://api.xiaomimimo.com/v1",
  }),
];

const BUILT_IN_BY_ID = new Map(BUILT_IN_PROVIDERS.map((p) => [p.id, p]));

const CUSTOM_PROVIDERS_KEY = "forge:custom-providers";

export function loadCustomProviders(): AiProvider[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROVIDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiProvider[];
    return parsed.filter((p) => p.isUserAdded && p.id?.startsWith("custom-"));
  } catch {
    return [];
  }
}

export function saveCustomProviders(providers: AiProvider[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(providers));
}

export function addCustomProvider(input: CustomProviderInput): AiProvider {
  const slug = input.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id: CustomProviderId = `custom-${slug || crypto.randomUUID().slice(0, 8)}`;
  const provider: AiProvider = {
    id,
    label: input.label.trim(),
    icon: "globe",
    docUrl: "",
    keyPrefix: input.keyPrefix?.trim() || "sk-",
    keyPlaceholder: input.keyPlaceholder?.trim() || "sk-...",
    costPerM: 0,
    openAiCompatible: true,
    supportsPool: true,
    baseUrl: input.baseUrl.trim().replace(/\/$/, ""),
    isUserAdded: true,
    models: [],
  };
  const current = loadCustomProviders();
  saveCustomProviders([...current, provider]);
  return provider;
}

export function removeCustomProvider(id: CustomProviderId) {
  const current = loadCustomProviders();
  saveCustomProviders(current.filter((p) => p.id !== id));
}

export function allProviders(): AiProvider[] {
  return [...BUILT_IN_PROVIDERS, ...loadCustomProviders()];
}

export function providerById(id: AiProviderId | string): AiProvider | undefined {
  return allProviders().find((p) => p.id === id);
}

export function isBuiltInProvider(id: string): id is BuiltInProviderId {
  return BUILT_IN_BY_ID.has(id as BuiltInProviderId);
}

export function isKnownProvider(id: string): boolean {
  return allProviders().some((p) => p.id === id);
}

export function providerIds(): AiProviderId[] {
  return allProviders().map((p) => p.id);
}

export function providersSorted(): AiProvider[] {
  return allProviders().sort((a, b) => a.label.localeCompare(b.label, "pt"));
}

export function providersSupportingPool(): AiProvider[] {
  return allProviders().filter((p) => p.supportsPool);
}

/** Mapeia ID do registry → payload enviado ao edge function connector-upsert. */
export function toConnectorPayload(id: AiProviderId, baseUrl?: string) {
  const p = providerById(id);
  const label = p?.label ?? id;

  if (id === "anthropic") {
    return { kind: "anthropic" as const, meta: { label, provider: "anthropic" } };
  }

  return {
    kind: "openai" as const,
    meta: {
      provider: id,
      label,
      baseUrl: baseUrl ?? p?.baseUrl,
    },
  };
}

/** Helpers para montar presets a partir do registry. */
export function makePresetForProvider(
  id: AiProviderId,
  model: string,
  opts?: {
    label?: string;
    description?: string;
    tier?: ModelTier;
    recommended?: boolean;
  },
): ForgeModelPreset {
  const p = providerById(id);
  const slug = model.includes("/") ? model : `${id}/${model}`;
  const bare = model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
  return {
    id: slug.replace(/\//g, "--").replace(/\./g, "-"),
    env: id as ForgeModelPreset["env"],
    model: bare,
    openRouterSlug: slug,
    label: opts?.label ?? bare,
    description: opts?.description ?? `API ${p?.label ?? id}`,
    tier: opts?.tier ?? "balanced",
    brand: p?.label ?? id,
    rank: 5000,
    llmProvider: id === "anthropic" ? "anthropic" : "openai",
    baseUrl: p?.baseUrl,
    secretKey: p?.keyPrefix ?? "API_KEY",
    recommended: opts?.recommended,
  };
}
