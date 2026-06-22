/**
 * Runtime wire — espelha src/lib/ai-provider-registry.ts (secretKey, baseUrl, llmProvider).
 * Não duplica catálogo de modelos; só metadados de conexão por provider.
 */

export type PresetWireShape = {
  provider: string;
  model: string;
  label: string;
  secretKey: string;
  baseUrl?: string;
};

/** Sync com BUILT_IN_PROVIDERS em ai-provider-registry.ts */
const BUILTIN_RUNTIME: Record<
  string,
  { secretKey: string; provider: string; baseUrl?: string; deepseekChat?: boolean }
> = {
  alibaba: {
    secretKey: "DASHSCOPE_API_KEY",
    provider: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  anthropic: { secretKey: "ANTHROPIC_API_KEY", provider: "anthropic" },
  deepseek: {
    secretKey: "DEEPSEEK_API_KEY",
    provider: "openai",
    baseUrl: "https://api.deepseek.com",
    deepseekChat: true,
  },
  gemini: { secretKey: "GEMINI_API_KEY", provider: "gemini" },
  groq: {
    secretKey: "GROQ_API_KEY",
    provider: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  minimax: {
    secretKey: "MINIMAX_API_KEY",
    provider: "openai",
    baseUrl: "https://api.minimax.io/v1",
  },
  moonshotai: {
    secretKey: "MOONSHOT_API_KEY",
    provider: "openai",
    baseUrl: "https://api.moonshot.ai/v1",
  },
  nvidia: {
    secretKey: "NVIDIA_API_KEY",
    provider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
  ollama: { secretKey: "OLLAMA_BASE_URL", provider: "ollama" },
  openai: {
    secretKey: "OPENAI_API_KEY",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
  },
  openrouter: {
    secretKey: "OPENROUTER_API_KEY",
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  xai: {
    secretKey: "XAI_API_KEY",
    provider: "openai",
    baseUrl: "https://api.x.ai/v1",
  },
  xiaomi: {
    secretKey: "MIMO_API_KEY",
    provider: "openai",
    baseUrl: "https://api.xiaomimimo.com/v1",
  },
};

export function customProviderSecretKey(providerId: string): string {
  return `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

export function customProviderBaseUrlKey(secretKey: string): string {
  return secretKey.replace(/_API_KEY$/, "_BASE_URL");
}

export function secretKeyForProvider(providerId: string): string | null {
  const p = providerId.trim();
  if (!p) return null;
  if (p.startsWith("custom-")) return customProviderSecretKey(p);
  return BUILTIN_RUNTIME[p]?.secretKey ?? (p === "openai" ? "OPENAI_API_KEY" : null);
}

/** Aplica token de connector → dict de chaves runtime (uma chave por provider). */
export function applyOpenAiConnectorToken(
  provider: string,
  token: string,
  meta: { baseUrl?: string; defaultModel?: string } = {},
): Record<string, string> {
  const keys: Record<string, string> = {};
  const p = provider.trim();
  const spec = BUILTIN_RUNTIME[p];

  if (p === "ollama") {
    const base = meta.baseUrl?.trim().replace(/\/$/, "");
    if (base) keys.OLLAMA_BASE_URL = base;
    if (meta.defaultModel?.trim()) keys.OLLAMA_MODEL = meta.defaultModel.trim();
    return keys;
  }

  if (p.startsWith("custom-")) {
    const secretKey = customProviderSecretKey(p);
    keys[secretKey] = token;
    const base = meta.baseUrl?.trim().replace(/\/$/, "");
    if (base) keys[customProviderBaseUrlKey(secretKey)] = base;
    return keys;
  }

  if (spec) {
    keys[spec.secretKey] = token;
    return keys;
  }

  if (p === "openai") keys.OPENAI_API_KEY = token;
  return keys;
}

function bareModelFromSlug(env: string, slug: string): string {
  const s = slug.includes("/") ? slug : `${env}/${slug}`;
  return s.split("/").pop() ?? s;
}

function nvidiaModelFromSlug(slug: string): string {
  let nimSlug = slug.includes("/") ? slug : `nvidia/${slug}`;
  const bare = nimSlug.includes("/") ? (nimSlug.split("/").pop() ?? nimSlug) : nimSlug;
  if (bare.includes("nemotron-3-ultra-550b") && !bare.includes("-a55b")) {
    nimSlug = "nvidia/nemotron-3-ultra-550b-a55b";
  }
  if (bare.includes("nemotron-3-super-120b") && !bare.includes("-a12b")) {
    nimSlug = "nvidia/nemotron-3-super-120b-a12b";
  }
  return nimSlug;
}

/** Resolve wire para modelo adicionado pelo usuário (passo 3 — cadastrar modelo). */
export function wireFromProviderEntry(entry: {
  env: string;
  slug: string;
  label?: string;
}): PresetWireShape | null {
  const slug = entry.slug.includes("/") ? entry.slug : `${entry.env}/${entry.slug}`;
  const label = entry.label ?? slug;

  if (entry.env.startsWith("custom-")) {
    return {
      provider: "openai",
      model: bareModelFromSlug(entry.env, slug),
      label,
      secretKey: customProviderSecretKey(entry.env),
    };
  }

  const spec = BUILTIN_RUNTIME[entry.env];
  if (!spec) return null;

  if (entry.env === "openrouter") {
    return {
      provider: "openrouter",
      model: slug,
      label,
      secretKey: spec.secretKey,
      baseUrl: spec.baseUrl,
    };
  }

  if (entry.env === "deepseek") {
    return {
      provider: spec.provider,
      model: "deepseek-chat",
      label,
      secretKey: spec.secretKey,
      baseUrl: spec.baseUrl,
    };
  }

  if (entry.env === "nvidia") {
    return {
      provider: spec.provider,
      model: nvidiaModelFromSlug(slug),
      label,
      secretKey: spec.secretKey,
      baseUrl: spec.baseUrl,
    };
  }

  if (entry.env === "minimax") {
    const bare = bareModelFromSlug(entry.env, slug);
    let model = "MiniMax-M3";
    if (bare.includes("m3")) model = "MiniMax-M3";
    else if (bare.includes("2.7")) model = "MiniMax-M2.7";
    else if (bare.includes("2.5")) model = "MiniMax-M2.5";
    return {
      provider: spec.provider,
      model,
      label,
      secretKey: spec.secretKey,
      baseUrl: spec.baseUrl,
    };
  }

  if (entry.env === "moonshotai") {
    const bare = bareModelFromSlug(entry.env, slug);
    let model = bare.replace(/-/g, ".");
    if (bare.includes("k2.6") || bare.includes("k2-6")) model = "kimi-k2.6";
    else if (bare.includes("k2.5") || bare.includes("k2-5")) model = "kimi-k2.5";
    return {
      provider: spec.provider,
      model,
      label,
      secretKey: spec.secretKey,
      baseUrl: spec.baseUrl,
    };
  }

  if (entry.env === "alibaba") {
    const bare = bareModelFromSlug(entry.env, slug);
    let model = bare;
    if (bare.includes("qwen3.7-max") || bare.includes("qwen3-7-max")) model = "qwen-max";
    else if (bare.includes("qwen3.7-plus") || bare.includes("qwen3-7-plus")) model = "qwen-plus";
    else if (bare.includes("qwen3.6-plus") || bare.includes("qwen3-6-plus")) model = "qwen-plus";
    else if (bare.includes("qwen3.6-flash") || bare.includes("qwen3-6-flash")) model = "qwen-turbo";
    else if (bare.includes("coder")) model = "qwen-coder-plus";
    return {
      provider: spec.provider,
      model,
      label,
      secretKey: spec.secretKey,
      baseUrl: spec.baseUrl,
    };
  }

  if (entry.env === "ollama") {
    const model = slug.includes("/") ? (slug.split("/").pop() ?? slug) : slug;
    return { provider: "ollama", model, label, secretKey: spec.secretKey };
  }

  return {
    provider: spec.provider,
    model: bareModelFromSlug(entry.env, slug),
    label,
    secretKey: spec.secretKey,
    baseUrl: spec.baseUrl,
  };
}