export type PlatformSecretDef = {
  name: string;
  label: string;
  description: string;
  placeholder?: string;
};

/** Secrets globais configuráveis pelo admin em Ajustes. */
export const PLATFORM_SECRET_DEFINITIONS: PlatformSecretDef[] = [
  {
    name: "E2B_API_KEY",
    label: "E2B",
    description: "Preview ao vivo e sandbox de execução (agent-run, preview-boot).",
    placeholder: "e2b_...",
  },
  {
    name: "E2B_TEMPLATE",
    label: "E2B template",
    description: "Template do sandbox (ex.: nodejs). Opcional.",
    placeholder: "nodejs",
  },
  {
    name: "XAI_API_KEY",
    label: "xAI (Grok)",
    description: "Fallback global de STT e modelos Grok.",
    placeholder: "xai-...",
  },
  {
    name: "GROQ_API_KEY",
    label: "Groq",
    description: "Fallback global Llama / Whisper.",
    placeholder: "gsk_...",
  },
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    description: "Fallback global Claude.",
    placeholder: "sk-ant-...",
  },
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI",
    description: "Fallback global GPT.",
    placeholder: "sk-...",
  },
  {
    name: "NVIDIA_API_KEY",
    label: "NVIDIA NIM",
    description: "Fallback global NIM.",
    placeholder: "nvapi-...",
  },
];