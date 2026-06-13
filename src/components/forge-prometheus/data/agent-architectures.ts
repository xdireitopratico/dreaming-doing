/**
 * Agent architecture/type options for PrometheusOnboarding Step 1
 * Each maps to a Codex genome
 */
export interface AgentArchitecture {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  genome: string;
  nodesEstimate: number;
  gradient: string;
}

export const AGENT_ARCHITECTURES: AgentArchitecture[] = [
  {
    id: "qa_simples",
    emoji: "💬",
    label: "Q&A Simples",
    desc: "Responde perguntas usando base de conhecimento. Sem estado entre turnos.",
    genome: "qa_simple",
    nodesEstimate: 3,
    gradient: "linear-gradient(135deg, hsl(142 30% 12%), hsl(142 70% 35%))",
  },
  {
    id: "suporte_multi",
    emoji: "🔄",
    label: "Suporte Multi-turno",
    desc: "Conversa contextual com memória. Escalação para humano quando necessário.",
    genome: "support_multi",
    nodesEstimate: 6,
    gradient: "linear-gradient(135deg, hsl(210 30% 12%), hsl(210 80% 40%))",
  },
  {
    id: "closer_vendas",
    emoji: "🎯",
    label: "Closer de Vendas",
    desc: "Qualifica leads, identifica necessidades e guia para conversão.",
    genome: "sales_closer",
    nodesEstimate: 7,
    gradient: "linear-gradient(135deg, hsl(25 30% 12%), hsl(25 100% 40%))",
  },
  {
    id: "triagem",
    emoji: "🏥",
    label: "Triagem / Classificação",
    desc: "Classifica solicitações por urgência/tipo e direciona para especialista.",
    genome: "triage",
    nodesEstimate: 5,
    gradient: "linear-gradient(135deg, hsl(0 30% 12%), hsl(0 70% 40%))",
  },
  {
    id: "pesquisa_rag",
    emoji: "📚",
    label: "Pesquisa RAG",
    desc: "Busca semântica em documentos internos com respostas contextualizadas.",
    genome: "rag_research",
    nodesEstimate: 8,
    gradient: "linear-gradient(135deg, hsl(271 30% 12%), hsl(271 80% 40%))",
  },
  {
    id: "automacao",
    emoji: "⚙️",
    label: "Automação de Processos",
    desc: "Executa workflows com múltiplas ferramentas integradas automaticamente.",
    genome: "automation",
    nodesEstimate: 10,
    gradient: "linear-gradient(135deg, hsl(45 30% 12%), hsl(45 80% 40%))",
  },
];
