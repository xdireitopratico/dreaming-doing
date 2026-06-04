import type { ConnectorId, IntegrationMode } from "@/lib/connectors/integration-prefs";

export type ConnectorSurface = "platform" | "ai";

export type ConnectorRegistryEntry = {
  id: ConnectorId;
  name: string;
  /** Copy voltada ao usuário final (sem refs internas). */
  description: string;
  /** Uma linha no modal desconectado. */
  tagline: string;
  forgeAvailable: boolean;
  signupUrl: string;
  docsUrl?: string;
  costNote?: string;
  tokenLabel?: string;
  tokenPlaceholder?: string;
  /** Conectável via connector-upsert (github, vercel, cloudflare). */
  upsertKind?: "github" | "vercel" | "cloudflare";
  showInEditorBar?: boolean;
  showOnConnectorsPage?: boolean;
};

export const CONNECTOR_REGISTRY: Record<ConnectorId, ConnectorRegistryEntry> = {
  github: {
    id: "github",
    name: "GitHub",
    description: "Versiona o código, importa repositórios e publica com push.",
    tagline: "Conecte o GitHub para sincronizar e fazer deploy do seu app.",
    forgeAvailable: true,
    signupUrl: "https://github.com/signup",
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "ghp_...",
    upsertKind: "github",
    showInEditorBar: true,
    showOnConnectorsPage: true,
  },
  supabase: {
    id: "supabase",
    name: "Supabase",
    description: "Banco de dados, autenticação, Realtime e funções do seu projeto.",
    tagline: "Use a infraestrutura FORGE ou conecte seu próprio projeto Supabase.",
    forgeAvailable: true,
    signupUrl: "https://supabase.com/dashboard/sign-up",
    docsUrl: "https://supabase.com/docs/guides/getting-started",
    showInEditorBar: true,
    showOnConnectorsPage: true,
  },
  vercel: {
    id: "vercel",
    name: "Vercel",
    description: "Hospeda preview e produção a cada alteração.",
    tagline: "Publique na Vercel com a conta FORGE ou com a sua.",
    forgeAvailable: true,
    signupUrl: "https://vercel.com/signup",
    docsUrl: "https://vercel.com/docs/rest-api#authentication",
    costNote: "Plano Hobby é gratuito; tráfego e funções extras podem gerar cobrança.",
    tokenLabel: "Access Token",
    tokenPlaceholder: "vca_...",
    upsertKind: "vercel",
    showInEditorBar: true,
    showOnConnectorsPage: true,
  },
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare Pages",
    description: "Deploy global na edge da Cloudflare.",
    tagline: "Conecte sua conta Cloudflare para publicar na edge.",
    forgeAvailable: false,
    signupUrl: "https://dash.cloudflare.com/sign-up",
    docsUrl: "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
    tokenLabel: "API Token",
    tokenPlaceholder: "cf_...",
    upsertKind: "cloudflare",
    showOnConnectorsPage: true,
  },
  e2b: {
    id: "e2b",
    name: "Sandbox (E2B)",
    description: "Ambiente isolado onde o preview ao vivo e o agente executam comandos.",
    tagline: "O preview usa sandbox FORGE por padrão. Você pode usar sua chave E2B depois.",
    forgeAvailable: true,
    signupUrl: "https://e2b.dev/docs",
    docsUrl: "https://e2b.dev/docs/pricing",
    costNote: "Há tier gratuito; uso intenso de sandboxes pode gerar cobrança na E2B.",
    showInEditorBar: true,
    showOnConnectorsPage: true,
  },
};

export const EDITOR_BAR_CONNECTORS = (
  Object.values(CONNECTOR_REGISTRY) as ConnectorRegistryEntry[]
).filter((c) => c.showInEditorBar);

export const CONNECTORS_PAGE_LIST = (
  Object.values(CONNECTOR_REGISTRY) as ConnectorRegistryEntry[]
).filter((c) => c.showOnConnectorsPage);

export function isConnectorActive(
  id: ConnectorId,
  mode: IntegrationMode,
  status: { connected: boolean; forgeAvailable: boolean },
): boolean {
  if (id === "e2b") return mode === "forge" && status.forgeAvailable;
  return (mode === "forge" && status.forgeAvailable) || (mode === "own" && status.connected);
}