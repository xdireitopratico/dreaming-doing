/**
 * PrometheusHomeLanding — Landing page sections (workflow, value prop, use cases)
 * Extracted from PrometheusHome for anti-monolithic compliance (P1)
 */
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { PrometheusTemplateGallery } from "./PrometheusTemplateGallery";
import { PrometheusCapabilities } from "./PrometheusCapabilities";
import { PrometheusRecentAgents } from "./PrometheusRecentAgents";


interface Props {
  onTemplateSelect: (prompt: string) => void;
  recentAgents?: Array<{
    id: string;
    name: string;
    status: string;
    nodesCount: number;
    lastRun: string;
  }>;
  onOpenAgent?: (flowId: string) => void;
  onDeleteAgent?: (flowId: string) => void;
}

export function PrometheusHomeLanding({ onTemplateSelect, recentAgents = [], onOpenAgent, onDeleteAgent }: Props) {
  return (
    <>
      {/* ═══ WORKFLOW — 5 PASSOS ═══ */}
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-[1000px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <h2 className="text-center text-[18px] sm:text-[22px] font-bold mb-2" style={{ color: "var(--ps-cream)" }}>
              Como o Prometheus constrói seu agente
            </h2>
            <p className="text-center text-[12px] sm:text-[13px] mb-10" style={{ color: "var(--ps-cream-40)" }}>
              Da sua ideia até um agente em produção — totalmente automatizado
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-3">
            {[
              { step: "01", icon: "🧠", title: "Entender", desc: "Analisa seus requisitos, identifica o problema e mapeia as necessidades do seu negócio." },
              { step: "02", icon: "📐", title: "Projetar", desc: "5 agentes especializados colaboram para arquitetar a melhor solução possível." },
              { step: "03", icon: "✍️", title: "Escrever", desc: "Gera os prompts de sistema, regras de comportamento e lógica de decisão." },
              { step: "04", icon: "🧪", title: "Testar", desc: "Executa testes automatizados para validar qualidade, segurança e consistência." },
              { step: "05", icon: "🚀", title: "Entregar", desc: "Agente pronto para deploy em múltiplos canais: chat, API, WhatsApp e mais." },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative rounded-xl p-5 text-center"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
              >
                <div className="text-[28px] mb-3">{s.icon}</div>
                <div className="text-[9px] font-mono mb-1" style={{ color: "var(--ps-accent-dim)" }}>PASSO {s.step}</div>
                <h3 className="text-[14px] font-semibold mb-2" style={{ color: "var(--ps-cream-80)" }}>{s.title}</h3>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--ps-cream-40)" }}>{s.desc}</p>
                {i < 4 && (
                  <ChevronRight className="hidden sm:block absolute -right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: "var(--ps-cream-15)" }} />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROPOSTA DE VALOR ═══ */}
      <section className="px-4 sm:px-6 py-12 sm:py-16" style={{ background: "rgba(59,130,246,0.03)" }}>
        <div className="max-w-[900px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <h2 className="text-center text-[18px] sm:text-[22px] font-bold mb-3" style={{ color: "var(--ps-cream)" }}>
              Por que usar o Prometheus?
            </h2>
            <p className="text-center text-[12px] sm:text-[13px] max-w-[600px] mx-auto mb-10" style={{ color: "var(--ps-cream-40)" }}>
              Criar agentes de IA normalmente exige semanas de desenvolvimento. Com o Prometheus, você descreve o que precisa e recebe um agente profissional em minutos.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { icon: "⚡", title: "Velocidade", desc: "De semanas para minutos. Descreva seu agente e o Prometheus faz o resto — arquitetura, prompts, testes e deploy.", highlight: "10x mais rápido" },
              { icon: "🎯", title: "Precisão", desc: "5 agentes especializados revisam cada decisão. O resultado é um agente consistente, seguro e alinhado com seu negócio.", highlight: "Qualidade enterprise" },
              { icon: "🔧", title: "Controle Total", desc: "Edite cada nó, prompt e conexão no editor visual. Ajuste fino sem código, com preview em tempo real.", highlight: "Zero lock-in" },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="rounded-xl p-6"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
              >
                <div className="text-[32px] mb-4">{item.icon}</div>
                <h3 className="text-[15px] font-semibold mb-2" style={{ color: "var(--ps-cream-80)" }}>{item.title}</h3>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--ps-cream-40)" }}>{item.desc}</p>
                <span className="inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(59,130,246,0.12)", color: "var(--ps-accent)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  {item.highlight}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CASOS DE USO ═══ */}
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-[900px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-center text-[18px] sm:text-[22px] font-bold mb-2" style={{ color: "var(--ps-cream)" }}>
              O que você pode construir
            </h2>
            <p className="text-center text-[12px] sm:text-[13px] mb-10" style={{ color: "var(--ps-cream-40)" }}>
              Exemplos reais de agentes criados com o Prometheus
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { emoji: "⚖️", title: "Assistente Jurídico", desc: "Pesquisa jurisprudência, analisa contratos e monta petições iniciais com base em precedentes." },
              { emoji: "🏥", title: "Triagem Médica", desc: "Coleta sintomas, prioriza urgência e direciona pacientes para a especialidade correta." },
              { emoji: "🛒", title: "Vendas Inteligentes", desc: "Qualifica leads, responde dúvidas sobre produtos e agenda demonstrações automaticamente." },
              { emoji: "📚", title: "Suporte Técnico", desc: "Resolve tickets de nível 1, escala problemas complexos e aprende com cada interação." },
            ].map((uc, i) => (
              <motion.div
                key={uc.title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex gap-4 rounded-xl p-5"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
              >
                <div className="text-[28px] shrink-0">{uc.emoji}</div>
                <div>
                  <h3 className="text-[13px] font-semibold mb-1" style={{ color: "var(--ps-cream-80)" }}>{uc.title}</h3>
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--ps-cream-40)" }}>{uc.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CAPABILITIES ═══ */}
      <PrometheusCapabilities />

      {/* ═══ TEMPLATES ═══ */}
      <PrometheusTemplateGallery onUseTemplate={onTemplateSelect} />

      {/* ═══ RECENT AGENTS — FOOTER AREA ═══ */}
      {recentAgents.length > 0 && (
        <PrometheusRecentAgents
          agents={recentAgents}
          onOpen={onOpenAgent}
          onDelete={onDeleteAgent}
        />
      )}
    </>
  );
}
