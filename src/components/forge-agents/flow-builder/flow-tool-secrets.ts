import type { Node } from "@/types/xyflow-react-shim";

/** Per-model NVIDIA secret names (aligned with llm-router NVIDIA_SECRET_MAP). */
export const NVIDIA_MODEL_SECRET_MAP: Record<string, string> = {
  "nvidia/qwen3.5-397b-a17b": "NVIDIA_QWEN35_397B_A17B_API_KEY",
  "nvidia/nemotron-3-super-120b-a12b": "NVIDIA_NEMOTRON3_SUPER_120B_API_KEY",
  "nvidia/nemotron-3-nano-30b-a3b": "NVIDIA_NEMOTRON3_SUPER_30B_API_KEY",
};

/** Collect operation secrets required by tool nodes in the flow. */
export function extractToolSecrets(nodes: Node[]): string[] {
  const secrets = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "tool") continue;
    const config = (node.data as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
    if (!config) continue;

    if (config.auth_type === "bearer" || config.auth_type === "api_key") {
      const name = config.auth_secret_name;
      if (typeof name === "string" && name.trim()) secrets.add(name.trim());
    }
    if (typeof config.api_key_secret === "string" && config.api_key_secret.trim()) {
      secrets.add(config.api_key_secret.trim());
    }
    if (Array.isArray(config.required_secrets)) {
      for (const s of config.required_secrets) {
        if (typeof s === "string" && s.trim()) secrets.add(s.trim());
      }
    }
  }

  return Array.from(secrets);
}

export interface FlowToolRef {
  toolName: string;
  requiredSecrets: string[];
  nodeId: string;
  label: string;
}

/** Tools referenced by tool nodes (for health checks). */
export function extractFlowTools(nodes: Node[]): FlowToolRef[] {
  const refs: FlowToolRef[] = [];

  for (const node of nodes) {
    if (node.type !== "tool") continue;
    const data = node.data as Record<string, unknown> | undefined;
    const config = data?.config as Record<string, unknown> | undefined;
    if (!config) continue;
    const toolName = config?.tool_name;
    if (typeof toolName !== "string" || !toolName.trim()) continue;

    const required = new Set<string>();
    if (typeof config.auth_secret_name === "string" && config.auth_secret_name.trim()) {
      required.add(config.auth_secret_name.trim());
    }
    if (typeof config.api_key_secret === "string" && config.api_key_secret.trim()) {
      required.add(config.api_key_secret.trim());
    }
    if (Array.isArray(config.required_secrets)) {
      for (const s of config.required_secrets) {
        if (typeof s === "string" && s.trim()) required.add(s.trim());
      }
    }

    refs.push({
      toolName: toolName.trim(),
      requiredSecrets: Array.from(required),
      nodeId: node.id,
      label: typeof data?.label === "string" ? data.label : toolName,
    });
  }

  return refs;
}
