/**
 * Agent personality options for PrometheusOnboarding Step 0
 */
export interface AgentPersonality {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  gradient: string;
}

export const AGENT_PERSONALITIES: AgentPersonality[] = [
  {
    id: "profissional",
    emoji: "👔",
    label: "Profissional",
    desc: "Tom corporativo e formal. Ideal para escritórios, consultorias e atendimento B2B.",
    gradient: "linear-gradient(135deg, hsl(225 30% 12%), hsl(210 80% 30%))",
  },
  {
    id: "amigavel",
    emoji: "😊",
    label: "Amigável",
    desc: "Tom caloroso e acolhedor. Perfeito para e-commerce, suporte ao consumidor e onboarding.",
    gradient: "linear-gradient(135deg, hsl(142 30% 12%), hsl(142 70% 35%))",
  },
  {
    id: "tecnico",
    emoji: "🔧",
    label: "Técnico",
    desc: "Tom objetivo e preciso. Ideal para suporte técnico, documentação e troubleshooting.",
    gradient: "linear-gradient(135deg, hsl(217 30% 12%), hsl(217 90% 40%))",
  },
  {
    id: "empatico",
    emoji: "💙",
    label: "Empático",
    desc: "Tom sensível e compreensivo. Perfeito para saúde, mediação e atendimento social.",
    gradient: "linear-gradient(135deg, hsl(271 30% 12%), hsl(271 80% 40%))",
  },
  {
    id: "direto",
    emoji: "⚡",
    label: "Direto",
    desc: "Tom assertivo e sem rodeios. Ideal para vendas, negociação e atendimento rápido.",
    gradient: "linear-gradient(135deg, hsl(25 30% 12%), hsl(25 100% 40%))",
  },
  {
    id: "consultivo",
    emoji: "🎓",
    label: "Consultivo",
    desc: "Tom educativo e orientador. Perfeito para consultoria, coaching e treinamento.",
    gradient: "linear-gradient(135deg, hsl(45 30% 12%), hsl(45 80% 40%))",
  },
];
