/**
 * prometheusCatalog.ts — Prometheus catalog
 * C1 FIX: Uses REAL model-catalog-frontend as source of truth.
 * Exports provider/model data for dual-dropdown selector.
 */

import {
  PROVIDERS,
  findModel,
  type ProviderDefinition,
  type ModelDefinition,
} from "@/components/forge-agents/flow-builder/model-catalog-frontend";

// Re-export for Prometheus components
export { PROVIDERS, findModel };
export type { ProviderDefinition, ModelDefinition };

/**
 * Get display-friendly provider list for the first dropdown.
 * Filters only providers that have chat-allowed models.
 */
export function getProvidersForPrometheusChatModels(): ProviderDefinition[] {
  return PROVIDERS.filter(p => p.models.some(m => m.chatAllowed && !m.deprecated));
}

/**
 * Get models for a specific provider, filtered for Prometheus use.
 * Only returns chat-allowed, non-deprecated models.
 */
export function getModelsForProvider(providerId: string): ModelDefinition[] {
  const provider = PROVIDERS.find(p => p.id === providerId);
  if (!provider) return [];
  return provider.models.filter(m => m.chatAllowed && !m.deprecated);
}

/**
 * Estimate cost per interaction based on real model data.
 * Uses costPer1kIn + costPer1kOut with ~500 tokens in, ~300 tokens out average.
 */
export function estimateAgentCost(modelId: string): number {
  const model = findModel(modelId);
  if (!model) return 0;
  const costIn = (model.costPer1kIn ?? 0) * 0.5; // ~500 tokens in
  const costOut = (model.costPer1kOut ?? 0) * 0.3; // ~300 tokens out
  return costIn + costOut;
}

/**
 * Format cost for display. Returns "Gratuito" for free/local models.
 */
export function formatModelCost(modelId: string): string {
  const cost = estimateAgentCost(modelId);
  if (cost === 0) return "Gratuito";
  if (cost < 0.001) return `~$${(cost * 1000).toFixed(2)}/1K msgs`;
  return `~$${cost.toFixed(4)}/msg`;
}

// ═══ TEMPLATES ═══

export const AGENT_TEMPLATES = [
  {
    id: "juridico",
    label: "Assistente Jurídico",
    emoji: "⚖️",
    prompt: "Agente que pesquisa jurisprudência, analisa documentos legais e sugere argumentos para petições.",
    complexity: "Médio",
    nodesCount: 7,
    gradient: "linear-gradient(135deg, hsl(225 30% 12%), hsl(210 80% 30%))",
  },
  {
    id: "closer",
    label: "Closer de Vendas",
    emoji: "🎯",
    prompt: "Agente que qualifica leads via WhatsApp, identifica necessidades e agenda reuniões com vendedores.",
    complexity: "Médio",
    nodesCount: 6,
    gradient: "linear-gradient(135deg, hsl(25 80% 15%), hsl(25 100% 40%))",
  },
  {
    id: "suporte",
    label: "Suporte Técnico",
    emoji: "🛠️",
    prompt: "Agente que responde dúvidas técnicas usando a base de conhecimento da empresa, com escalação para humano.",
    complexity: "Simples",
    nodesCount: 5,
    gradient: "linear-gradient(135deg, hsl(142 30% 12%), hsl(142 70% 35%))",
  },
  {
    id: "onboarding",
    label: "Onboarding de Clientes",
    emoji: "🚀",
    prompt: "Agente que guia novos clientes pelo processo de cadastro, coleta documentos e configura conta.",
    complexity: "Médio",
    nodesCount: 8,
    gradient: "linear-gradient(135deg, hsl(271 30% 12%), hsl(271 80% 40%))",
  },
  {
    id: "triagem",
    label: "Triagem Médica",
    emoji: "🏥",
    prompt: "Agente que faz triagem inicial de sintomas, classifica urgência e direciona para especialista.",
    complexity: "Complexo",
    nodesCount: 10,
    gradient: "linear-gradient(135deg, hsl(0 30% 12%), hsl(0 70% 40%))",
  },
  {
    id: "pesquisa",
    label: "Pesquisador RAG",
    emoji: "📚",
    prompt: "Agente que busca informações em documentos internos usando RAG com busca semântica e responde perguntas complexas.",
    complexity: "Complexo",
    nodesCount: 9,
    gradient: "linear-gradient(135deg, hsl(217 30% 12%), hsl(217 90% 40%))",
  },
  {
    id: "agendamento",
    label: "Agendamento Inteligente",
    emoji: "📅",
    prompt: "Agente que gerencia agenda de profissionais, sugere horários disponíveis e confirma consultas automaticamente.",
    complexity: "Simples",
    nodesCount: 4,
    gradient: "linear-gradient(135deg, hsl(180 30% 12%), hsl(180 70% 35%))",
  },
  {
    id: "financeiro",
    label: "Consultor Financeiro",
    emoji: "💰",
    prompt: "Agente que analisa dados financeiros, gera relatórios e responde dúvidas sobre fluxo de caixa e investimentos.",
    complexity: "Complexo",
    nodesCount: 11,
    gradient: "linear-gradient(135deg, hsl(45 30% 12%), hsl(45 80% 40%))",
  },
];

// ═══ CAPABILITIES ═══

export const AGENT_CAPABILITIES = [
  { title: "Criação com IA", desc: "Descreva sua ideia. O Prometheus constrói o agente completo automaticamente.", gradient: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.03))" },
  { title: "Multi-Canal", desc: "Deploy instantâneo em Web Widget, WhatsApp, Telegram e API REST.", gradient: "linear-gradient(135deg, rgba(52,211,153,0.15), rgba(52,211,153,0.03))" },
  { title: "RAG Inteligente", desc: "Upload de documentos para criar base de conhecimento com busca semântica.", gradient: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.03))" },
  { title: "Compliance Automático", desc: "Guardrails de segurança, detecção de PII e conformidade regulatória.", gradient: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.03))" },
  { title: "Tools Integradas", desc: "Conecte calendários, CRMs, APIs e serviços externos sem código.", gradient: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.03))" },
  { title: "Monitoramento", desc: "Dashboard em tempo real com métricas de qualidade, latência e custo.", gradient: "linear-gradient(135deg, rgba(52,211,153,0.12), rgba(59,130,246,0.03))" },
  { title: "Versionamento", desc: "Controle de versão semântico com rollback instantâneo.", gradient: "linear-gradient(135deg, rgba(107,154,196,0.15), rgba(107,154,196,0.03))" },
  { title: "Colaboração", desc: "Trabalhe em equipe com roles, comentários e aprovações.", gradient: "linear-gradient(135deg, rgba(244,208,111,0.12), rgba(255,107,53,0.03))" },
  { title: "Auto-Healing", desc: "Prometheus monitora e corrige problemas automaticamente em produção.", gradient: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.03))" },
];

// ═══ TEMPLATE CATEGORIES ═══

export const TEMPLATE_CATEGORIES = [
  "Todos", "Atendimento", "Vendas", "Jurídico", "Saúde", "Financeiro", "Automação"
] as const;

export const TEMPLATE_CATEGORY_MAP: Record<string, string> = {
  juridico: "Jurídico",
  closer: "Vendas",
  suporte: "Atendimento",
  onboarding: "Automação",
  triagem: "Saúde",
  pesquisa: "Automação",
  agendamento: "Atendimento",
  financeiro: "Financeiro",
};
