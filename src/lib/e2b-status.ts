/** Linha pública do conector E2B (connectors_public). */
export type E2bConnectorRow = {
  kind: string | null;
  provider?: string | null;
  meta?: Record<string, unknown> | null;
};

export function isE2bConnectorRow(row: E2bConnectorRow): boolean {
  return (row.kind ?? "").trim() === "e2b";
}

/** Chave salva em API Keys (linha em connectors_public). */
export function isE2bConfigured(rows: E2bConnectorRow[] | undefined): boolean {
  return (rows ?? []).some(isE2bConnectorRow);
}

/** Smoke test passou (meta gravado no save ou e2b-health). */
export function isE2bHealthOk(meta?: Record<string, unknown> | null): boolean {
  return meta?.e2bHealthOk === true;
}

/** Pronto para agente/preview: chave salva + health OK. */
export function isE2bConnected(rows: E2bConnectorRow[] | undefined): boolean {
  const row = (rows ?? []).find(isE2bConnectorRow);
  if (!row) return false;
  return isE2bHealthOk(row.meta);
}

const E2B_SETUP_SNIPPET = "Sandbox E2B não configurado";

export function isE2bNotConfiguredError(message: string, code?: string): boolean {
  if (code === "e2b_not_configured") return true;
  return message.includes(E2B_SETUP_SNIPPET);
}

/** Erros de preview-boot / sandbox — não confundir falha da API E2B com chave ausente. */
export function formatE2bUserError(message: string, code?: string): string {
  if (isE2bNotConfiguredError(message, code)) {
    return "Chave E2B não encontrada no servidor. Abra API Keys (/api), salve de novo e recarregue o editor.";
  }
  if (code === "e2b_key_invalid") {
    return "Chave E2B recusada. Gere uma nova em e2b.dev e salve em API Keys (/api).";
  }
  if (code === "e2b_template_failed") {
    return message.includes("Node/npm")
      ? message
      : "Template E2B sem Node/npm na sua conta. Use code-interpreter-v1 ou template custom com Node.";
  }

  const lower = message.toLowerCase();
  if (message.includes("template") && message.includes("not found")) {
    return "Template E2B indisponível na sua conta. O FORGE usa code-interpreter-v1 — confira templates em e2b.dev.";
  }
  if (lower.includes("e2b connect 401") || lower.includes("e2b create 401")) {
    return "Chave E2B recusada pela E2B (401). Gere uma nova em e2b.dev e atualize em API Keys (/api).";
  }
  if (lower.includes("e2b connect 403") || lower.includes("e2b create 403")) {
    return "Chave E2B sem permissão (403). Confira o plano/créditos na E2B e atualize a chave em /api.";
  }
  if (message.includes("sem Node/npm") || message.includes("Node/npm")) {
    return message;
  }
  if (message.includes("E2B connect") || message.includes("E2B create")) {
    return `Falha ao conectar na E2B: ${message.slice(0, 160)}`;
  }
  if (message.includes("ambiente ao vivo") || message.includes("ambiente deste projeto")) {
    return message;
  }

  return message;
}