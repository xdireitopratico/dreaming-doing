/**
 * Schema Validator — Validação de compatibilidade entre nós conectados
 * Verifica output→input schemas, tools disponíveis, secrets e ciclos
 * @version 2.0.0 — Round 34: BYOK secrets validation per provider
 */

import type { Node, Edge } from "@/types/xyflow-react-shim";
import { findModel, PROVIDERS } from "../model-catalog-frontend";

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  nodeId?: string;
  edgeId?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  message: string;
  suggestion?: string;
}

// Define output/input schemas por tipo de nó
const NODE_SCHEMAS: Record<string, { outputs: string[]; inputs: string[]; requiresConfig?: string[] }> = {
  trigger: {
    outputs: ["message", "metadata", "session_id", "channel"],
    inputs: [],
  },
  llm: {
    outputs: ["response", "tokens_in", "tokens_out", "model"],
    inputs: ["messages", "text", "message", "prompt", "context", "response"],
    requiresConfig: ["model"],
  },
  stt: {
    outputs: ["text", "confidence", "language"],
    inputs: ["audio_url", "audio"],
  },
  tts: {
    outputs: ["audio_url", "duration"],
    inputs: ["text", "response", "message"],
  },
  tool: {
    outputs: ["result", "data", "response"],
    inputs: ["message", "text", "data", "query", "response"],
    requiresConfig: ["tool_name"],
  },
  condition: {
    outputs: ["true", "false"],
    inputs: ["message", "text", "data", "response", "result", "value"],
    requiresConfig: ["expression"],
  },
  output_guard: {
    outputs: ["filtered_text", "violations"],
    inputs: ["text", "response", "message", "result"],
  },
  rag_search: {
    outputs: ["chunks", "sources", "relevance_scores"],
    inputs: ["query", "text", "message"],
  },
  hitl: {
    outputs: ["approved", "response", "reviewer"],
    inputs: ["request", "text", "message", "data", "response"],
  },
  loop: {
    outputs: ["results", "iteration_count"],
    inputs: ["items", "data", "results"],
  },
  switch: {
    outputs: ["case_match", "value"],
    inputs: ["value", "text", "data", "response", "result", "message"],
    requiresConfig: ["cases"],
  },
  memory: {
    outputs: ["value", "data"],
    inputs: ["key", "value", "data", "text", "message", "response"],
  },
  delay: {
    outputs: ["completed"],
    inputs: ["message", "text", "data", "response"],
  },
  sub_flow: {
    outputs: ["output", "result"],
    inputs: ["input", "message", "data"],
    requiresConfig: ["flow_id"],
  },
  transformer: {
    outputs: ["transformed", "data"],
    inputs: ["data", "text", "message", "response", "result", "value"],
    requiresConfig: ["template"],
  },
  error_handler: {
    outputs: ["recovery_action", "fallback_response"],
    inputs: ["error", "data", "message"],
  },
};

// Tipos de nó que produzem texto (compatíveis com inputs de texto)
const TEXT_PRODUCERS = new Set(["trigger", "llm", "stt", "rag_search", "transformer", "memory", "tool", "output_guard"]);
// Tipos de nó que produzem áudio
const AUDIO_PRODUCERS = new Set(["tts"]);
// Tipos de nó que produzem dados estruturados
const DATA_PRODUCERS = new Set(["tool", "rag_search", "transformer", "memory", "loop", "sub_flow"]);

function getNodeLabel(node: Node): string {
  const config = (node.data as Record<string, Record<string, string>>)?.config || {};
  return config.tool_display_name || config.tool_name || config.label || node.type || "desconhecido";
}

function checkOutputInputCompatibility(
  sourceNode: Node,
  targetNode: Node,
): ValidationIssue | null {
  const sourceType = sourceNode.type || "";
  const targetType = targetNode.type || "";

  if (targetType === "stt" && !AUDIO_PRODUCERS.has(sourceType)) {
    return {
      id: `compat_${sourceNode.id}_${targetNode.id}`,
      severity: "error",
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      message: `"${getNodeLabel(sourceNode)}" não produz áudio — STT requer audio_url`,
      suggestion: "Conecte um nó TTS ou fonte de áudio antes do STT",
    };
  }

  if (targetType === "tts" && !TEXT_PRODUCERS.has(sourceType)) {
    return {
      id: `compat_${sourceNode.id}_${targetNode.id}`,
      severity: "warning",
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      message: `"${getNodeLabel(sourceNode)}" pode não produzir texto compatível com TTS`,
      suggestion: "Use um nó LLM, Transformer ou similar antes do TTS",
    };
  }

  if (targetType === "output_guard" && !TEXT_PRODUCERS.has(sourceType)) {
    return {
      id: `compat_${sourceNode.id}_${targetNode.id}`,
      severity: "warning",
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      message: `Output Guard espera texto — "${getNodeLabel(sourceNode)}" pode não produzir texto`,
      suggestion: "Conecte um nó que produza texto (LLM, Transformer, etc.)",
    };
  }

  if (targetType === "loop" && !DATA_PRODUCERS.has(sourceType) && sourceType !== "trigger") {
    return {
      id: `compat_${sourceNode.id}_${targetNode.id}`,
      severity: "warning",
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      message: `Loop espera items[] — "${getNodeLabel(sourceNode)}" pode não produzir lista`,
      suggestion: "Use Tool, RAG Search ou Transformer para gerar a lista",
    };
  }

  return null;
}

function detectCycles(nodes: Node[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const adj = new Map<string, string[]>();
  
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): boolean {
    if (inStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart);
      issues.push({
        id: `cycle_${cycle.join("_")}`,
        severity: "error",
        nodeId: nodeId,
        message: `Ciclo detectado: ${cycle.length} nós em loop infinito`,
        suggestion: "Remova uma das conexões para quebrar o ciclo, ou use um nó Loop",
      });
      return true;
    }
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);
    
    for (const next of adj.get(nodeId) || []) {
      if (dfs(next, [...path, nodeId])) return true;
    }
    
    inStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  return issues;
}

/**
 * Round 34: Validate that LLM nodes using non-platform providers have BYOK secrets configured.
 * This is a static check — runtime checks happen in the gateway.
 */
function validateSecrets(nodes: Node[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of nodes) {
    if (node.type !== "llm") continue;
    const config = (node.data as Record<string, any>)?.config || {};
    const modelId = config.model_id || config.model || "";
    if (!modelId) continue;

    const model = findModel(modelId);
    if (!model) continue;

    const provider = PROVIDERS.find(p => p.id === model.provider);
    if (!provider) continue;

    // Skip local providers and platform-provided ones
    if (provider.id === "ollama") continue;
    if (provider.platformProvided) continue;

    // This provider requires BYOK
    const nodeLabel = config.label || node.id;
    issues.push({
      id: `byok_${node.id}_${provider.id}`,
      severity: "warning",
      nodeId: node.id,
      message: `"${nodeLabel}" usa ${model.label} (${provider.label}) — requer API key BYOK`,
      suggestion: `Abra o painel Secrets e configure ${provider.secretEnvKey}`,
    });
  }

  return issues;
}

export function validateFlow(nodes: Node[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 1. Trigger obrigatório
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0 && nodes.length > 0) {
    issues.push({
      id: "no_trigger",
      severity: "error",
      message: "Flow precisa de pelo menos 1 nó Trigger",
      suggestion: "Arraste um nó Trigger da paleta",
    });
  }

  // 2. Nós órfãos
  const connectedIds = new Set([...edges.map((e) => e.source), ...edges.map((e) => e.target)]);
  for (const node of nodes) {
    if (node.type !== "trigger" && !connectedIds.has(node.id)) {
      issues.push({
        id: `orphan_${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: `Nó "${getNodeLabel(node)}" está desconectado`,
        suggestion: "Conecte este nó ao flow ou remova-o",
      });
    }
  }

  // 3. Config obrigatória faltando
  for (const node of nodes) {
    const schema = NODE_SCHEMAS[node.type || ""];
    if (!schema?.requiresConfig) continue;
    
    const config = (node.data as Record<string, Record<string, unknown>>)?.config || {};
    for (const field of schema.requiresConfig) {
      // For LLM nodes, check model_id OR model (backward compat)
      if (node.type === "llm" && field === "model") {
        if (!config.model && !config.model_id) {
          issues.push({
            id: `config_${node.id}_${field}`,
            severity: "warning",
            nodeId: node.id,
            message: `"${getNodeLabel(node)}" sem modelo configurado`,
            suggestion: `Clique no nó e selecione um modelo LLM`,
          });
        }
        continue;
      }
      if (!config[field]) {
        issues.push({
          id: `config_${node.id}_${field}`,
          severity: "warning",
          nodeId: node.id,
          message: `"${getNodeLabel(node)}" sem configuração: ${field}`,
          suggestion: `Clique no nó e configure "${field}"`,
        });
      }
    }
  }

  // 4. HITL sem timeout
  for (const node of nodes) {
    if (node.type === "hitl") {
      const config = (node.data as Record<string, Record<string, unknown>>)?.config || {};
      if (!config.timeout_hours) {
        issues.push({
          id: `hitl_timeout_${node.id}`,
          severity: "warning",
          nodeId: node.id,
          message: "HITL sem timeout configurado — pode bloquear execução",
          suggestion: "Configure um timeout (ex: 24h)",
        });
      }
    }
  }

  // 5. Compatibilidade output→input entre edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const issue = checkOutputInputCompatibility(source, target);
    if (issue) {
      issue.edgeId = edge.id;
      issues.push(issue);
    }
  }

  // 6. Trigger não pode receber conexões
  for (const edge of edges) {
    const target = nodeMap.get(edge.target);
    if (target?.type === "trigger") {
      issues.push({
        id: `trigger_input_${edge.id}`,
        severity: "error",
        edgeId: edge.id,
        targetNodeId: edge.target,
        message: "Trigger não pode receber conexões de entrada",
        suggestion: "Remova a conexão de entrada do Trigger",
      });
    }
  }

  // 7. Condition/Switch sem saídas conectadas
  for (const node of nodes) {
    if (node.type === "condition") {
      const outEdges = edges.filter((e) => e.source === node.id);
      const hasTrue = outEdges.some((e) => e.sourceHandle === "true");
      const hasFalse = outEdges.some((e) => e.sourceHandle === "false");
      if (!hasTrue || !hasFalse) {
        issues.push({
          id: `condition_branch_${node.id}`,
          severity: "warning",
          nodeId: node.id,
          message: `Condição sem branch ${!hasTrue ? "true" : "false"} conectado`,
          suggestion: "Conecte ambas as saídas (true/false)",
        });
      }
    }
  }

  // 8. Detecção de ciclos
  issues.push(...detectCycles(nodes, edges));

  // 9. BYOK secrets validation (Round 34)
  issues.push(...validateSecrets(nodes));

  return issues;
}
