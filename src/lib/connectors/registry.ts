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
  /** Conectável via connector-upsert. */
  upsertKind?: "github" | "vercel" | "netlify" | "cloudflare" | "e2b" | "supabase";
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
    docsUrl:
      "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
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
    tagline: "Conecte seu projeto Supabase (URL + chave anon ou service role).",
    forgeAvailable: false,
    signupUrl: "https://supabase.com/dashboard/sign-up",
    docsUrl: "https://supabase.com/docs/guides/getting-started",
    tokenLabel: "Chave anon ou service role",
    tokenPlaceholder: "eyJhbG…",
    upsertKind: "supabase",
    showInEditorBar: true,
    showOnConnectorsPage: true,
  },
  netlify: {
    id: "netlify",
    name: "Netlify",
    description: "Deploy estático e Jamstack na edge global Netlify.",
    tagline: "Publique na Netlify com sua conta — alternativa forte à Vercel.",
    forgeAvailable: false,
    signupUrl: "https://app.netlify.com/signup",
    docsUrl: "https://docs.netlify.com/api/get-started-with-the-netlify-api/",
    costNote: "Plano Starter gratuito; build minutes extras podem cobrar.",
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "nfp_...",
    upsertKind: "netlify",
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
    tagline: "Configure a chave E2B em API Keys — preview e agente usam só a sua conta.",
    forgeAvailable: false,
    tokenLabel: "API Key E2B",
    tokenPlaceholder: "e2b_...",
    upsertKind: "e2b",
    signupUrl: "https://e2b.dev/docs",
    docsUrl: "https://e2b.dev/docs/pricing",
    costNote: "Há tier gratuito; uso intenso de sandboxes pode gerar cobrança na E2B.",
    showInEditorBar: false,
    showOnConnectorsPage: false,
  },
};

export const EDITOR_BAR_CONNECTORS = (
  Object.values(CONNECTOR_REGISTRY) as ConnectorRegistryEntry[]
).filter((c) => c.showInEditorBar);

export const CONNECTORS_PAGE_LIST = (
  Object.values(CONNECTOR_REGISTRY) as ConnectorRegistryEntry[]
).filter((c) => c.showOnConnectorsPage);

/** Conector ativo = credencial do usuário salva (sem modo FORGE global). */
export function isConnectorActive(
  _id: ConnectorId,
  _mode: IntegrationMode,
  status: { connected: boolean },
): boolean {
  return status.connected;
}
