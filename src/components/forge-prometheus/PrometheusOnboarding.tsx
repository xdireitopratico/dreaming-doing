/**
 * PrometheusOnboarding — 4-step agent briefing wizard
 * Mirrors VideoStudioOnboarding UX with blue/graph theme
 * Steps: Personality → Architecture → Channels → Review
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, ArrowLeft, Rocket, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { AGENT_PERSONALITIES, type AgentPersonality } from "./data/agent-personalities";
import { AGENT_ARCHITECTURES, type AgentArchitecture } from "./data/agent-architectures";
import { AGENT_CHANNELS, AGENT_TOOL_CATEGORIES, AGENT_INTEGRATIONS } from "./data/agent-channels";
import { findModel, formatModelCost } from "./prometheusCatalog";
import "./prometheus-studio.css";

// ═══ EXPORTED TYPES ═══
export interface AgentBriefingData {
  personality: string;
  architecture_type: string;
  channels: string[];
  integrations: string[];
  auto_healing: boolean;
  quality_model: string;
  prompt: string;
}

export interface PrometheusLaunchConfig {
  prompt: string;
  qualityModel: string;
}

// ═══ STYLE CONSTANTS (mirrors VideoStudioOnboarding) ═══
const S = {
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid var(--ps-border)",
    borderRadius: 12,
    padding: "24px",
  } as React.CSSProperties,
  sectionLabel: {
    fontSize: 12, fontWeight: 600, color: "var(--ps-cream-60)",
    marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
  } as React.CSSProperties,
  title: { color: "var(--ps-cream)", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
  subtitle: { color: "var(--ps-cream-60)", fontSize: 12, marginTop: 4, lineHeight: 1.5 } as React.CSSProperties,
  optionBase: {
    display: "flex", alignItems: "flex-start", gap: 8,
    padding: "10px 14px", borderRadius: 8,
    fontSize: 13, textAlign: "left" as const,
    cursor: "pointer", transition: "all 0.15s",
    border: "1px solid var(--ps-border)",
    background: "rgba(255,255,255,0.02)",
    color: "var(--ps-cream-60)",
    width: "100%",
  } as React.CSSProperties,
  optionSelected: {
    border: "1px solid var(--ps-accent)",
    background: "rgba(59,130,246,0.1)",
    color: "var(--ps-cream)",
  } as React.CSSProperties,
  optionHint: { fontSize: 11, color: "var(--ps-cream-25)", marginTop: 2, lineHeight: 1.4 } as React.CSSProperties,
  btn: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
    cursor: "pointer", transition: "all 0.15s",
    border: "1px solid var(--ps-border)",
    background: "rgba(255,255,255,0.04)", color: "var(--ps-cream-60)",
  } as React.CSSProperties,
  btnPrimary: {
    background: "var(--ps-accent-subtle)", borderColor: "var(--ps-accent-glow)",
    color: "var(--ps-accent)", fontWeight: 600,
  } as React.CSSProperties,
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" } as React.CSSProperties,
  accent: { color: "var(--ps-accent)" } as React.CSSProperties,
  divider: { height: 1, background: "var(--ps-border)", margin: "16px 0" } as React.CSSProperties,
};

const DEFAULT_DATA: AgentBriefingData = {
  personality: "",
  architecture_type: "",
  channels: [],
  integrations: [],
  auto_healing: true,
  quality_model: "balanced",
  prompt: "",
};

interface Props {
  onComplete: (data: AgentBriefingData) => void;
  isProcessing?: boolean;
  launchConfig: PrometheusLaunchConfig;
  onGoBack?: () => void;
}

export default function PrometheusOnboarding({ onComplete, isProcessing, launchConfig, onGoBack }: Props) {
  const TOTAL_STEPS = 4;
  const storageKey = useRef(
    `ps_onboarding_${btoa(String.fromCharCode(...new TextEncoder().encode(launchConfig.prompt.slice(0, 60)))).replace(/[^a-zA-Z0-9]/g, "")}`
  ).current;

  const [step, setStep] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved)?.step || 0 : 0;
    } catch { return 0; }
  });

  const [data, setData] = useState<AgentBriefingData>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.data) return { ...DEFAULT_DATA, ...parsed.data, quality_model: launchConfig.qualityModel, prompt: launchConfig.prompt };
      }
    } catch {}
    return { ...DEFAULT_DATA, quality_model: launchConfig.qualityModel, prompt: launchConfig.prompt };
  });

  // Auto-save
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ step, data, savedAt: Date.now() }));
    } catch {}
  }, [step, data, storageKey]);

  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const modelEntry = findModel(launchConfig.qualityModel);

  const canAdvance = useCallback(() => {
    if (step === 0) return !!data.personality;
    if (step === 1) return !!data.architecture_type;
    if (step === 2) return data.channels.length > 0;
    return true;
  }, [step, data.personality, data.architecture_type, data.channels.length]);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1 && canAdvance()) setStep(s => s + 1);
  }, [step, canAdvance]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
    else onGoBack?.();
  }, [step, onGoBack]);

  const handleSubmit = useCallback(() => {
    onComplete({ ...data, quality_model: launchConfig.qualityModel, prompt: launchConfig.prompt });
    try { localStorage.removeItem(storageKey); } catch {}
  }, [data, onComplete, launchConfig, storageKey]);

  const toggleMulti = (field: "channels" | "integrations", value: string) => {
    setData(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  // ═══ RENDER HELPERS ═══
  const renderOptionCard = (
    item: { id: string; emoji: string; label: string; desc: string; gradient?: string },
    selected: boolean,
    onClick: () => void,
    showGradient = true,
  ) => (
    <button
      key={item.id}
      onClick={onClick}
      style={{
        ...S.optionBase,
        ...(selected ? S.optionSelected : {}),
        ...(showGradient && item.gradient ? { backgroundImage: selected ? item.gradient : undefined, backgroundSize: "cover" } : {}),
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{item.emoji}</span>
      <div>
        <div style={{ fontWeight: 600, color: selected ? "var(--ps-cream)" : "var(--ps-cream-80)" }}>{item.label}</div>
        <div style={S.optionHint}>{item.desc}</div>
      </div>
      {selected && <CheckCircle2 className="w-4 h-4 ml-auto flex-shrink-0" style={S.accent} />}
    </button>
  );

  return (
    <div className="prometheus-studio relative" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "auto", background: "var(--ps-bg)" }}>
      <div className="relative z-10 flex flex-col items-center flex-1 px-4 sm:px-6 py-6">

        {/* Progress bar */}
        <div className="w-full max-w-[640px] mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium" style={{ color: "var(--ps-cream-60)" }}>
              Etapa {step + 1} de {TOTAL_STEPS}
            </span>
            <span className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
              {modelEntry ? `🧠 ${modelEntry.label}` : ""}
            </span>
          </div>
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--ps-border)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: "var(--ps-accent)" }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="w-full max-w-[640px] flex-1">

          {/* ═══ STEP 0: PERSONALITY ═══ */}
          {step === 0 && (
            <div style={S.card}>
              <div style={S.title}>
                <span>👤</span> Personalidade do Agente
              </div>
              <div style={S.subtitle}>
                Como seu agente vai se comunicar? Escolha o tom que melhor representa sua marca.
              </div>
              <div style={S.divider} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AGENT_PERSONALITIES.map(p =>
                  renderOptionCard(p, data.personality === p.id, () => setData(prev => ({ ...prev, personality: p.id })))
                )}
              </div>
            </div>
          )}

          {/* ═══ STEP 1: ARCHITECTURE ═══ */}
          {step === 1 && (
            <div style={S.card}>
              <div style={S.title}>
                <span>🏗️</span> Tipo de Agente
              </div>
              <div style={S.subtitle}>
                Qual arquitetura define melhor o comportamento do seu agente?
              </div>
              <div style={S.divider} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AGENT_ARCHITECTURES.map(a =>
                  renderOptionCard(a, data.architecture_type === a.id, () => setData(prev => ({ ...prev, architecture_type: a.id })))
                )}
              </div>
            </div>
          )}

          {/* ═══ STEP 2: CHANNELS & INTEGRATIONS ═══ */}
          {step === 2 && (
            <div style={S.card}>
              <div style={S.title}>
                <span>📡</span> Canais e Integrações
              </div>
              <div style={S.subtitle}>
                Onde seu agente vai atuar e quais ferramentas vai usar?
              </div>
              <div style={S.divider} />

              <div style={S.sectionLabel}>🌐 Canais de Atendimento</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {AGENT_CHANNELS.map(c =>
                  renderOptionCard(c, data.channels.includes(c.id), () => toggleMulti("channels", c.id), false)
                )}
              </div>

              <div style={S.sectionLabel}>🔌 Ferramentas & Integrações</div>
              <div className="space-y-2 mb-4">
                {AGENT_TOOL_CATEGORIES.map(cat => (
                  <ToolCategoryAccordion
                    key={cat.id}
                    category={cat}
                    selectedTools={data.integrations}
                    onToggleTool={(toolId) => toggleMulti("integrations", toolId)}
                  />
                ))}
              </div>

              <div style={S.divider} />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium" style={{ color: "var(--ps-cream-80)" }}>🛡️ Auto-Healing</div>
                  <div className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>Prometheus monitora e corrige problemas automaticamente</div>
                </div>
                <button
                  onClick={() => setData(prev => ({ ...prev, auto_healing: !prev.auto_healing }))}
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{
                    background: data.auto_healing ? "var(--ps-accent)" : "rgba(255,255,255,0.1)",
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                    style={{
                      background: "var(--ps-cream)",
                      left: data.auto_healing ? "calc(100% - 18px)" : "2px",
                    }}
                  />
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: REVIEW ═══ */}
          {step === 3 && (
            <div style={S.card}>
              <div style={S.title}>
                <span>📋</span> Revisão do Agente
              </div>
              <div style={S.subtitle}>
                Confira as configurações antes de iniciar a construção.
              </div>
              <div style={S.divider} />

              {/* Prompt */}
              <div className="mb-3">
                <div style={S.sectionLabel}>💡 Descrição</div>
                <div className="text-[12px] leading-relaxed px-3 py-2 rounded-lg" style={{ color: "var(--ps-cream-80)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}>
                  {launchConfig.prompt}
                </div>
              </div>

              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <SummaryItem
                  label="Personalidade"
                  value={AGENT_PERSONALITIES.find(p => p.id === data.personality)?.label || "—"}
                  emoji={AGENT_PERSONALITIES.find(p => p.id === data.personality)?.emoji || "👤"}
                />
                <SummaryItem
                  label="Tipo"
                  value={AGENT_ARCHITECTURES.find(a => a.id === data.architecture_type)?.label || "—"}
                  emoji={AGENT_ARCHITECTURES.find(a => a.id === data.architecture_type)?.emoji || "🏗️"}
                />
                <SummaryItem
                  label="Canais"
                  value={data.channels.length > 0
                    ? data.channels.map(c => AGENT_CHANNELS.find(ch => ch.id === c)?.label).filter(Boolean).join(", ")
                    : "—"}
                  emoji="📡"
                />
                <SummaryItem
                  label="Motor"
                  value={modelEntry?.label || launchConfig.qualityModel}
                  emoji="⚙️"
                />
              </div>

              {data.integrations.length > 0 && (
                <div className="mt-3">
                  <div style={S.sectionLabel}>🔌 Integrações</div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.integrations.map(id => {
                      const integ = AGENT_INTEGRATIONS.find(i => i.id === id);
                      return (
                        <span key={id} className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: "rgba(59,130,246,0.1)", color: "var(--ps-accent)", border: "1px solid rgba(59,130,246,0.2)" }}>
                          {integ?.emoji} {integ?.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={S.divider} />

              {/* Cost estimate */}
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>Custo estimado por interação</span>
                <span className="text-[13px] font-semibold ps-mono" style={{ color: "var(--ps-green, hsl(142 70% 45%))" }}>
                  {formatModelCost(launchConfig.qualityModel)}
                </span>
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>Auto-Healing</span>
                <span className="text-[11px] font-medium" style={{ color: data.auto_healing ? "var(--ps-accent)" : "var(--ps-cream-40)" }}>
                  {data.auto_healing ? "✅ Ativado" : "❌ Desativado"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="w-full max-w-[640px] flex items-center justify-between mt-6 pb-4">
          <button onClick={handleBack} style={S.btn}>
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? "Voltar" : "Anterior"}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canAdvance()}
              style={{ ...S.btn, ...(canAdvance() ? S.btnPrimary : S.btnDisabled) }}
            >
              Próximo <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isProcessing}
              style={{ ...S.btn, ...S.btnPrimary, ...(isProcessing ? S.btnDisabled : {}) }}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 rounded-full animate-spin" style={{ border: "2px solid var(--ps-accent)", borderTopColor: "transparent" }} />
                  Construindo...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" /> Construir Agente
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ TOOL CATEGORY ACCORDION ═══
import type { AgentToolCategory } from "./data/agent-channels";

function ToolCategoryAccordion({ category, selectedTools, onToggleTool }: {
  category: AgentToolCategory;
  selectedTools: string[];
  onToggleTool: (toolId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCount = category.tools.filter(t => selectedTools.includes(t.id)).length;
  const hasComingSoon = category.tools.some(t => t.comingSoon);
  const allComingSoon = category.tools.every(t => t.comingSoon);

  return (
    <div style={{ border: "1px solid var(--ps-border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors"
        style={{
          background: selectedCount > 0 ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.02)",
          borderBottom: open ? "1px solid var(--ps-border)" : "none",
        }}
      >
        <span style={{ fontSize: 16 }}>{category.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: "var(--ps-cream-80)" }}>{category.label}</span>
            {selectedCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(59,130,246,0.15)", color: "var(--ps-accent)" }}>
                {selectedCount}
              </span>
            )}
            {allComingSoon && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(245,158,11,0.1)", color: "hsl(45 100% 55%)" }}>
                Em breve
              </span>
            )}
          </div>
          <div className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>{category.desc}</div>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--ps-cream-40)" }} />
              : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--ps-cream-40)" }} />}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1" style={{ background: "rgba(0,0,0,0.15)" }}>
          {category.tools.map(tool => {
            const selected = selectedTools.includes(tool.id);
            return (
              <button
                key={tool.id}
                onClick={() => !tool.comingSoon && onToggleTool(tool.id)}
                disabled={tool.comingSoon}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-all"
                style={{
                  background: selected ? "rgba(59,130,246,0.1)" : "transparent",
                  border: selected ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  opacity: tool.comingSoon ? 0.4 : 1,
                  cursor: tool.comingSoon ? "not-allowed" : "pointer",
                }}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium" style={{ color: selected ? "var(--ps-cream)" : "var(--ps-cream-60)" }}>
                    {tool.label}
                  </span>
                  <span className="text-[10px] ml-1.5" style={{ color: "var(--ps-cream-25)" }}>
                    — {tool.desc}
                  </span>
                </div>
                {tool.comingSoon && (
                  <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: "hsl(45 100% 55%)" }}>
                    Em breve
                  </span>
                )}
                {selected && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--ps-accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ SUMMARY ITEM ═══
function SummaryItem({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}>
      <div className="text-[10px] mb-0.5" style={{ color: "var(--ps-cream-40)" }}>{label}</div>
      <div className="text-[12px] font-medium" style={{ color: "var(--ps-cream-80)" }}>
        {emoji} {value}
      </div>
    </div>
  );
}
