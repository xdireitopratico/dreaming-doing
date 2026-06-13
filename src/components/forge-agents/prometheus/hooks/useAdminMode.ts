/**
 * useAdminMode — Gerencia o modo admin do Prometheus
 * Quando ativado, importa secrets da plataforma e auto-mapeia para tools
 */
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/lib/forge-admin";

/** Mapeamento: padrão do nome do secret → tool requirement */
const SECRET_TO_TOOL_MAP: Record<string, string[]> = {
  RESEND_API_KEY:            ["email_send"],
  EVOLUTION_API_TOKEN:       ["whatsapp_send"],
  EVOLUTION_API_URL:         ["whatsapp_send"],
  EVOLUTION_API_INSTANCE_ID: ["whatsapp_send"],
  TWILIO_ACCOUNT_SID:        ["sms_send", "voip_call"],
  TWILIO_AUTH_TOKEN:          ["sms_send", "voip_call"],
  TWILIO_WHATSAPP_NUMBER:    ["sms_send"],
  GROQ_API_KEY:              ["llm_generate"],
  OPENAI_API_KEY:            ["llm_generate"],
  ANTHROPIC_API_KEY:         ["llm_generate"],
  GOOGLE_AI_API_KEY:         ["llm_generate"],
  XAI_API_KEY:               ["llm_generate"],
  PERPLEXITY_API_KEY:        ["llm_generate"],
  NVIDIA_NEMOTRON3_SUPER_120B_API_KEY: ["llm_generate"],
  NVIDIA_NEMOTRON3_SUPER_30B_API_KEY:  ["llm_generate"],
  NVIDIA_QWEN35_397B_A17B_API_KEY:     ["llm_generate"],
  OPENROUTER_API_KEY:        ["llm_generate"],
  ELEVENLABS_API_KEY:        ["tts_synthesize"],
  FIRECRAWL_API_KEY:         ["web_scrape"],
  PEXELS_API_KEY:            ["image_search"],
  STRIPE_SECRET_KEY:         ["payment_create"],
  GOOGLE_CSE_API_KEY:        ["web_search_serper"],
  GOOGLE_CSE_CX_ID:          ["web_search_serper"],
  ESCAVADOR_API_KEY:         ["legal_search"],
  KLING_API_KEY:             ["video_generate"],
  RUNWAY_API_KEY:            ["video_generate"],
  META_APP_ID:               ["instagram_send", "facebook_send"],
  META_APP_SECRET:           ["instagram_send", "facebook_send"],
  WHATSAPP_CLOUD_API_TOKEN:  ["whatsapp_cloud_send"],
};

/** Provedores LLM disponíveis (quando há múltiplas chaves) */
const LLM_PROVIDERS: Record<string, string> = {
  GROQ_API_KEY:      "Groq",
  OPENAI_API_KEY:    "OpenAI",
  ANTHROPIC_API_KEY: "Anthropic",
  GOOGLE_AI_API_KEY: "Google AI",
  XAI_API_KEY:       "xAI (Grok)",
  PERPLEXITY_API_KEY: "Perplexity",
  OPENROUTER_API_KEY: "OpenRouter",
  NVIDIA_NEMOTRON3_SUPER_120B_API_KEY: "NVIDIA 120B",
  NVIDIA_NEMOTRON3_SUPER_30B_API_KEY:  "NVIDIA 30B",
  NVIDIA_QWEN35_397B_A17B_API_KEY:     "NVIDIA Qwen",
};

export interface AdminSecretMapping {
  secretName: string;
  tools: string[];
  available: boolean;
}

export interface LLMProviderOption {
  secretName: string;
  label: string;
}

export interface AdminModeState {
  isAdmin: boolean;
  isActive: boolean;
  isLoading: boolean;
  mappings: AdminSecretMapping[];
  llmProviders: LLMProviderOption[];
  selectedLLMProvider: string | null;
  toggleAdmin: () => void;
  selectLLMProvider: (secretName: string) => void;
  getToolSecrets: (toolName: string) => string[];
}

export function useAdminMode(): AdminModeState {
  const { isAdmin } = useAdmin();
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableSecrets, setAvailableSecrets] = useState<string[]>([]);
  const [selectedLLMProvider, setSelectedLLMProvider] = useState<string | null>(null);

  // Fetch available secrets when admin mode is activated
  useEffect(() => {
    if (!isActive || !isAdmin) {
      setAvailableSecrets([]);
      return;
    }

    const fetchSecrets = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("admin-secrets-map", {
          body: { action: "list_available" },
        });
        if (!error && data?.secrets) {
          setAvailableSecrets(data.secrets as string[]);
          // Auto-select first LLM provider
          const firstLLM = (data.secrets as string[]).find((s: string) => LLM_PROVIDERS[s]);
          if (firstLLM && !selectedLLMProvider) {
            setSelectedLLMProvider(firstLLM);
          }
        }
      } catch (err) {
        console.error("Failed to fetch admin secrets:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSecrets();
  }, [isActive, isAdmin]);

  const mappings: AdminSecretMapping[] = Object.entries(SECRET_TO_TOOL_MAP).map(([secretName, tools]) => ({
    secretName,
    tools,
    available: availableSecrets.includes(secretName),
  }));

  const llmProviders: LLMProviderOption[] = Object.entries(LLM_PROVIDERS)
    .filter(([key]) => availableSecrets.includes(key))
    .map(([key, label]) => ({ secretName: key, label }));

  const toggleAdmin = useCallback(() => {
    if (!isAdmin) return;
    setIsActive((prev) => !prev);
  }, [isAdmin]);

  const selectLLMProvider = useCallback((secretName: string) => {
    setSelectedLLMProvider(secretName);
  }, []);

  const getToolSecrets = useCallback((toolName: string): string[] => {
    if (!isActive) return [];
    return availableSecrets.filter((s) => SECRET_TO_TOOL_MAP[s]?.includes(toolName));
  }, [isActive, availableSecrets]);

  return {
    isAdmin,
    isActive,
    isLoading,
    mappings,
    llmProviders,
    selectedLLMProvider,
    toggleAdmin,
    selectLLMProvider,
    getToolSecrets,
  };
}
