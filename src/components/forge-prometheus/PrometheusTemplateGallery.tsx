/**
 * PrometheusTemplateGallery — Agent template gallery
 * Fork of Inspiration Gallery from VideoStudioHome
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Copy } from "lucide-react";
import { AGENT_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_MAP } from "./prometheusCatalog";

interface Props {
  onUseTemplate: (prompt: string) => void;
}

export function PrometheusTemplateGallery({ onUseTemplate }: Props) {
  const [category, setCategory] = useState<string>("Todos");
  const [hovered, setHovered] = useState<string | null>(null);

  const filtered = category === "Todos"
    ? AGENT_TEMPLATES
    : AGENT_TEMPLATES.filter(t => TEMPLATE_CATEGORY_MAP[t.id] === category);

  return (
    <section className="px-3 sm:px-6 pb-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-wide" style={{ color: "var(--ps-cream-80)" }}>
              Templates de Agentes
            </h2>
            <p className="text-[11px] mt-1" style={{ color: "var(--ps-cream-25)" }}>
              Use como ponto de partida ou como inspiração
            </p>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[var(--ps-border)] scrollbar-track-transparent sm:max-w-[60%]">
            {TEMPLATE_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`ps-tool-btn text-[10px] whitespace-nowrap ${category === cat ? "active" : ""}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="ps-template-card group"
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="h-[160px] flex items-center justify-center" style={{ background: item.gradient }}>
                <span className="text-4xl">{item.emoji}</span>
              </div>

              {/* Always visible info */}
              <div className="absolute bottom-0 left-0 right-0 p-3 z-[3]"
                style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.9))" }}>
                <div className="text-[12px] font-medium mb-1" style={{ color: "var(--ps-cream-80)" }}>
                  {item.label}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.15)", color: "var(--ps-accent)" }}>
                    {item.complexity}
                  </span>
                  <span className="text-[9px] ps-mono" style={{ color: "var(--ps-cream-25)" }}>{item.nodesCount} nós</span>
                </div>
              </div>

              {/* Hover overlay */}
              <div className={`ps-card-overlay ${hovered === item.id ? "" : "!opacity-0"}`}>
                <div className="flex gap-2">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                    style={{ background: "var(--ps-accent)", color: "#000" }}
                    onClick={() => onUseTemplate(item.prompt)}
                  >
                    <Play className="w-3 h-3" /> Usar template
                  </button>
                  <button
                    className="flex items-center justify-center px-2.5 py-2 rounded-lg transition-all hover:bg-white/10"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                    onClick={() => { navigator.clipboard.writeText(item.prompt).catch(() => {}); }}
                  >
                    <Copy className="w-3 h-3" style={{ color: "var(--ps-cream-60)" }} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
