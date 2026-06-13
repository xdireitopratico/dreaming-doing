import { motion } from "framer-motion";
import { Bot, MessageCircle, Brain, Shield, Zap, BarChart3, GitBranch, Users, Wand2 } from "lucide-react";
import { AGENT_CAPABILITIES } from "./prometheusCatalog";

const ICON_MAP: Record<string, React.ElementType> = {
  "Criação com IA": Bot,
  "Multi-Canal": MessageCircle,
  "RAG Inteligente": Brain,
  "Compliance Automático": Shield,
  "Tools Integradas": Zap,
  "Monitoramento": BarChart3,
  "Versionamento": GitBranch,
  "Colaboração": Users,
  "Auto-Healing": Wand2,
};

export function PrometheusCapabilities() {
  return (
    <section className="px-4 sm:px-6 pb-16">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6">
          <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-wide" style={{ color: "var(--ps-cream-80)" }}>
            Tudo que você pode criar
          </h2>
          <p className="text-[11px] mt-1" style={{ color: "var(--ps-cream-25)" }}>
            {AGENT_CAPABILITIES.length} capacidades — Do prompt ao agente em produção
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {AGENT_CAPABILITIES.map((cap, i) => {
            const Icon = ICON_MAP[cap.title] || Bot;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="ps-capability-block min-h-[168px]"
                style={{ background: cap.gradient }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: "var(--ps-accent)" }} />
                  </div>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--ps-cream-80)" }}>
                    {cap.title}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--ps-cream-40)" }}>
                  {cap.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
