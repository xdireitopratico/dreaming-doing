/**
 * DEPRECATED (Home 1.0) — Motor de Potência original.
 * Preservado para referência futura. Não está no fluxo atual.
 * O fluxo atual vai direto: prompt → Boardroom → building → review.
 * Último uso: AdminAgentBuilderView.handleGoHome redireciona para /agents.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, ChevronRight, ChevronDown, Plus, Upload, FileText,
  Mic, Square, PlayCircle, Wrench, Activity, Shield, Brain,
} from "lucide-react";
import { PrometheusParticles } from "./PrometheusParticles";
import { PrometheusHomeLanding } from "./PrometheusHomeLanding";

import { AGENT_TEMPLATES, estimateAgentCost, formatModelCost, getProvidersForPrometheusChatModels, getModelsForProvider, findModel } from "./prometheusCatalog";
import { useWhisperSTT } from "@/hooks/useWhisperSTT";
import { useAdminMode } from "@/components/forge-agents/prometheus/hooks/useAdminMode";
import "./prometheus-studio.css";

// ═══════════════════════════════════════════════════════════
// MORPHING TEXT
// ═══════════════════════════════════════════════════════════
const HERO_PHRASES = [
  "Que agente você quer criar?",
  "Qual problema seu agente vai resolver?",
  "Que experiência você quer oferecer?",
  "Que inteligência você quer dar ao seu negócio?",
];

function MorphingText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex(i => (i + 1) % HERO_PHRASES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative flex items-center justify-center" style={{ height: "clamp(40px, 6vw, 64px)" }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute whitespace-nowrap font-bold"
          style={{
            fontSize: "clamp(1.3rem, 3.2vw, 2.4rem)",
            color: "var(--ps-cream)",
            letterSpacing: "-0.5px",
          }}
        >
          {HERO_PHRASES[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
interface PrometheusHomeProps {
  onLaunch: (config: {
    prompt: string;
    qualityModel: string;
    fallbackModelId?: string;
    reasoningMode?: boolean;
    contextFiles?: File[];
  }) => void;
  onOpenBuilder?: () => void;
  onOpenBuilderWithFlow?: (flowId: string) => void;
  resumeSession?: {
    projectName: string;
    statusLabel: string;
    phase: string;
    onResume: () => void;
  } | null;
  recentAgents?: Array<{
    id: string;
    name: string;
    status: string;
    nodesCount: number;
    lastRun: string;
  }>;
  onOpenAgent?: (flowId: string) => void;
  onDeleteAgent?: (flowId: string) => void;
  onOpenMonitoring?: () => void;
  /** Pré-preenche o textarea (dashboard → Prometheus, draft do projeto). */
  initialPrompt?: string | null;
}

export function PrometheusHome({
  onLaunch,
  onOpenBuilder,
  onOpenBuilderWithFlow,
  resumeSession,
  recentAgents = [],
  onOpenAgent,
  onDeleteAgent,
  onOpenMonitoring,
  initialPrompt,
}: PrometheusHomeProps) {
  const adminMode = useAdminMode();
  const [prompt, setPrompt] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [fallbackProvider, setFallbackProvider] = useState<string | null>(null);
  const [fallbackModelId, setFallbackModelId] = useState<string>("");
  const [showFallbackProviderPicker, setShowFallbackProviderPicker] = useState(false);
  const [showFallbackPicker, setShowFallbackPicker] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showMobilePlus, setShowMobilePlus] = useState(false);
  const [showTemplatesExpanded, setShowTemplatesExpanded] = useState(false);
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  const [reasoningMode, setReasoningMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const whisperSTT = useWhisperSTT({
    language: "pt",
    onTranscript: (text) => {
      setPrompt(prev => (prev ? prev + " " : "") + text);
      textareaRef.current?.focus();
    },
  });

  useEffect(() => {
    const text = initialPrompt?.trim();
    if (!text) return;
    setPrompt((prev) => (prev.trim() ? prev : text));
  }, [initialPrompt]);

  // Click-outside handler to close all dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowProviderPicker(false);
        setShowModelPicker(false);
        setShowMobilePlus(false);
        setShowFallbackPicker(false);
        setShowFallbackProviderPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canLaunch = prompt.trim().length >= 10 && !!selectedModelId;

  const validationMessage = useMemo(() => {
    if (prompt.length === 0) return null;
    if (prompt.trim().length < 10) return "Mín. 10 caracteres";
    if (!selectedProvider) return "Selecione um fornecedor de IA";
    if (!selectedModelId) return "Selecione um modelo";
    return null;
  }, [prompt, selectedProvider, selectedModelId]);

  const estimatedCost = useMemo(() => formatModelCost(selectedModelId), [selectedModelId]);
  const availableProviders = useMemo(() => getProvidersForPrometheusChatModels(), []);
  const providerModels = useMemo(() => selectedProvider ? getModelsForProvider(selectedProvider) : [], [selectedProvider]);
  const selectedModelDef = useMemo(() => selectedModelId ? findModel(selectedModelId) : null, [selectedModelId]);
  const selectedProviderDef = useMemo(() => selectedProvider ? availableProviders.find(p => p.id === selectedProvider) : null, [selectedProvider, availableProviders]);
  const fallbackModelDef = useMemo(() => fallbackModelId ? findModel(fallbackModelId) : null, [fallbackModelId]);
  const fallbackProviderDef = useMemo(() => fallbackProvider ? availableProviders.find(p => p.id === fallbackProvider) : null, [fallbackProvider, availableProviders]);
  const fallbackProviderModels = useMemo(() => fallbackProvider ? getModelsForProvider(fallbackProvider).filter(m => m.id !== selectedModelId) : [], [fallbackProvider, selectedModelId]);

  const handleTemplateSelect = useCallback((templatePrompt: string) => {
    setPrompt(templatePrompt);
    textareaRef.current?.focus();
  }, []);

  const handleExampleSelect = (tpl: { prompt: string }) => {
    setPrompt(tpl.prompt);
    setShowMobilePlus(false);
    textareaRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="prometheus-studio relative overflow-y-auto" style={{ minHeight: "100%", height: "100%" }}>
      <PrometheusParticles />

      <div className="relative z-10 flex flex-col" style={{ minHeight: "100%" }}>

        {/* ═══ HERO SECTION ═══ */}
        <section className="flex flex-col items-center pt-8 sm:pt-16 pb-8 sm:pb-10 px-3 sm:px-6">
          {/* Top buttons — resume + open builder */}
          {(resumeSession || onOpenBuilder || onOpenMonitoring) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="w-full max-w-[800px] flex items-center justify-between gap-3 mb-4"
            >
              {/* Left: Monitoramento */}
              <div className="flex items-center gap-2">
                {onOpenMonitoring && (
                  <button
                    onClick={onOpenMonitoring}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02]"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--ps-border)",
                      color: "var(--ps-cream-60)",
                    }}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Monitoramento
                  </button>
                )}
              </div>

              {/* Center: Resume session */}
              {resumeSession ? (
                <button
                  onClick={resumeSession.onResume}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.12))",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "var(--ps-accent)",
                  }}
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[140px]">{resumeSession.projectName}</span>
                  <span className="text-[9px] opacity-50">· {resumeSession.statusLabel}</span>
                </button>
              ) : <div />}

              {/* Right: Abrir Agent Builder */}
              <div className="flex items-center gap-2">
                {onOpenBuilder && (
                  <button
                    onClick={onOpenBuilder}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02]"
                    style={{
                      background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.12))",
                      border: "1px solid rgba(59,130,246,0.3)",
                      color: "var(--ps-accent)",
                    }}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Abrir Agent Builder
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 mb-6"
          >
            <div className="w-6 h-px" style={{ background: "var(--ps-accent-glow)" }} />
            <span className="text-[10px] tracking-[4px] uppercase" style={{ color: "var(--ps-accent-dim)" }}>
              Prometheus Agent Engine
            </span>
            <div className="w-6 h-px" style={{ background: "var(--ps-accent-glow)" }} />
          </motion.div>

          {/* Morphing Hero Title */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <MorphingText />
          </motion.div>

          {/* ═══ PROMPT BAR ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="w-full max-w-[800px] mt-8"
          >
            <div className="ps-glass-accent rounded-2xl p-5 relative ps-animate-pulse-glow">
              <textarea
                ref={textareaRef}
                className="ps-prompt-textarea"
                rows={3}
                maxLength={500}
                placeholder="Um agente que ajuda advogados a pesquisar jurisprudência e montar petições..."
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
              />

              {/* Controls */}
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--ps-border)" }}>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md"
                  className="hidden"
                  ref={fileInputRef}
                  multiple
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      setContextFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />

                <div className="relative flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                  {/* Plus menu */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => { setShowModelPicker(false); setShowMobilePlus(prev => !prev); }}
                      className="ps-tool-btn p-1.5"
                      title="Mais opções"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {showMobilePlus && (
                      <div
                        className="absolute bottom-full left-0 mb-2 w-60 rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-200"
                        style={{ background: "var(--ps-bg-deep)", border: "1px solid var(--ps-border)" }}
                      >
                        {/* Templates */}
                        <button
                          onClick={() => setShowTemplatesExpanded(prev => !prev)}
                          className="w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between text-left hover:bg-[rgba(255,255,255,0.05)]"
                          style={{ color: "var(--ps-cream-40)" }}
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="w-3 h-3" style={{ color: "var(--ps-accent-dim)" }} />
                            Templates
                          </span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${showTemplatesExpanded ? 'rotate-180' : ''}`} style={{ color: "var(--ps-cream-25)" }} />
                        </button>
                        {showTemplatesExpanded && (
                          <div className="ml-2">
                            {AGENT_TEMPLATES.slice(0, 5).map((tpl, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleExampleSelect(tpl)}
                                className="w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 text-left hover:bg-[rgba(255,255,255,0.05)]"
                                style={{ color: "var(--ps-cream-80)" }}
                              >
                                <span>{tpl.emoji}</span>
                                <span style={{ color: "var(--ps-accent)" }}>{tpl.label}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="my-1 h-px" style={{ background: "var(--ps-border)" }} />

                        {/* Upload context */}
                        <button
                          onClick={() => { fileInputRef.current?.click(); setShowMobilePlus(false); }}
                          className="w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 text-left hover:bg-[rgba(255,255,255,0.05)]"
                          style={{ color: "var(--ps-cream-80)" }}
                        >
                          <Upload className="w-3 h-3" style={{ color: "var(--ps-accent-dim)" }} />
                          <span>Upload de contexto (PDF, docs)</span>
                          {contextFiles.length > 0 && (
                            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.2)", color: "var(--ps-accent)" }}>
                              {contextFiles.length}
                            </span>
                          )}
                        </button>
                        {contextFiles.length > 0 && (
                          <div className="px-2 py-1">
                            {contextFiles.map((f, i) => (
                              <div key={i} className="flex items-center justify-between text-[10px] py-0.5" style={{ color: "var(--ps-cream-60)" }}>
                                <span className="truncate max-w-[160px]">📎 {f.name}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setContextFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                                  className="text-[9px] ml-1 opacity-50 hover:opacity-100"
                                  style={{ color: "var(--ps-cream-40)" }}
                                >✕</button>
                              </div>
                            ))}
                          </div>
                          )}

                        {/* Admin Module toggle */}
                        {adminMode.isAdmin && (
                          <>
                            <div className="my-1 h-px" style={{ background: "var(--ps-border)" }} />
                            <button
                              onClick={() => { adminMode.toggleAdmin(); }}
                              className="w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between text-left hover:bg-[rgba(255,255,255,0.05)]"
                              style={{ color: adminMode.isActive ? "var(--ps-accent)" : "var(--ps-cream-40)" }}
                            >
                              <span className="flex items-center gap-2">
                                <Shield className="w-3 h-3" style={{ color: "var(--ps-accent)" }} />
                                Modo Admin
                              </span>
                              <span
                                className="w-7 h-4 rounded-full relative transition-colors"
                                style={{ background: adminMode.isActive ? "var(--ps-accent)" : "rgba(255,255,255,0.1)" }}
                              >
                                <span
                                  className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                                  style={{ left: adminMode.isActive ? "14px" : "2px" }}
                                />
                              </span>
                            </button>
                            {adminMode.isActive && adminMode.llmProviders.length > 0 && (
                              <div className="px-2 py-1">
                                <select
                                  value={adminMode.selectedLLMProvider || ""}
                                  onChange={(e) => adminMode.selectLLMProvider(e.target.value)}
                                  className="w-full text-[10px] rounded px-1.5 py-1 outline-none"
                                  style={{ background: "var(--ps-bg-surface)", color: "var(--ps-accent)", border: "1px solid var(--ps-border)" }}
                                >
                                  {adminMode.llmProviders.map((p) => (
                                    <option key={p.secretName} value={p.secretName}>{p.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Cost estimate */}
                  {selectedModelId && (
                    <span className="hidden sm:inline-flex text-[10px] ps-mono shrink-0 px-1.5 py-0.5 rounded" style={{ color: "var(--ps-green)", background: "rgba(52,211,153,0.08)" }}>
                      {estimatedCost}
                    </span>
                  )}

                  <div className="flex-1 min-w-[10px]" />

                  {/* Model picker (LEFT of provider — provider stays fixed) */}
                  {selectedProvider && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => { setShowProviderPicker(false); setShowMobilePlus(false); setShowModelPicker(prev => !prev); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors"
                        style={{ background: selectedModelId ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.05)", borderColor: selectedModelId ? "rgba(59,130,246,0.3)" : "var(--ps-border)", color: selectedModelId ? "var(--ps-accent)" : "var(--ps-cream-80)" }}
                        title="Modelo de IA"
                      >
                        {selectedModelDef?.label || "Modelo"}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showModelPicker && (
                        <div
                          className="absolute bottom-full right-0 mb-1 w-56 rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[280px] overflow-y-auto"
                          style={{ background: "var(--ps-bg-deep)", border: "1px solid var(--ps-border)" }}
                        >
                          {providerModels.length === 0 ? (
                            <div className="px-2 py-3 text-center text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
                              Nenhum modelo disponível
                            </div>
                          ) : providerModels.map(model => {
                            const isFree = (model.costPer1kIn ?? 0) === 0 && (model.costPer1kOut ?? 0) === 0;
                            const priceLabel = isFree
                              ? "FREE"
                              : `$${((model.costPer1kIn ?? 0) * 1000).toFixed(2)}/${((model.costPer1kOut ?? 0) * 1000).toFixed(2)}`;
                            return (
                              <button
                                key={model.id}
                                onClick={() => { setSelectedModelId(model.id); setShowModelPicker(false); }}
                                className={`w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${selectedModelId === model.id ? "bg-[var(--ps-accent-subtle)]" : "hover:bg-[rgba(255,255,255,0.05)]"}`}
                                style={{ color: selectedModelId === model.id ? "var(--ps-accent)" : "var(--ps-cream-80)" }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: model.quality === "very-high" ? "#f59e0b" : model.quality === "high" ? "#3b82f6" : "var(--ps-cream-25)" }} />
                                <span className="truncate flex-1">{model.label}</span>
                                <span
                                  className="text-[8px] font-semibold ml-auto shrink-0 px-1 py-0.5 rounded"
                                  style={{
                                    background: isFree ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.12)",
                                    color: isFree ? "#34d399" : "#f59e0b",
                                  }}
                                >
                                  {priceLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Provider picker (FIXED rightmost position) */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => { setShowMobilePlus(false); setShowModelPicker(false); setShowProviderPicker(prev => !prev); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors"
                      style={{ background: selectedProvider ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.05)", borderColor: selectedProvider ? "rgba(59,130,246,0.2)" : "var(--ps-border)", color: selectedProvider ? "var(--ps-accent)" : "var(--ps-cream-80)" }}
                      title="Fornecedor de IA"
                    >
                      {selectedProviderDef?.label || "Fornecedor"}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showProviderPicker && (
                      <div
                        className="absolute bottom-full right-0 mb-1 w-48 rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[240px] overflow-y-auto"
                        style={{ background: "var(--ps-bg-deep)", border: "1px solid var(--ps-border)" }}
                      >
                        {availableProviders.map(prov => (
                          <button
                            key={prov.id}
                            onClick={() => { setSelectedProvider(prov.id); setSelectedModelId(""); setShowProviderPicker(false); }}
                            className={`w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${selectedProvider === prov.id ? "bg-[var(--ps-accent-subtle)]" : "hover:bg-[rgba(255,255,255,0.05)]"}`}
                            style={{ color: selectedProvider === prov.id ? "var(--ps-accent)" : "var(--ps-cream-80)" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--ps-accent)" }} />
                            <span>{prov.label}</span>
                            <span className="text-[9px] opacity-40 ml-auto">{prov.models.filter(m => m.chatAllowed && !m.deprecated).length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fallback Provider picker */}
                  {selectedModelId && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => { setShowProviderPicker(false); setShowModelPicker(false); setShowMobilePlus(false); setShowFallbackPicker(false); setShowFallbackProviderPicker(prev => !prev); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors"
                        style={{
                          background: fallbackProvider ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)",
                          borderColor: fallbackProvider ? "rgba(52,211,153,0.2)" : "var(--ps-border)",
                          color: fallbackProvider ? "var(--ps-green)" : "var(--ps-cream-40)",
                        }}
                        title="Fornecedor de fallback (opcional)"
                      >
                        <Shield className="w-3 h-3" />
                        <span className="hidden sm:inline">{fallbackProviderDef?.label || "Fallback"}</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showFallbackProviderPicker && (
                        <div
                          className="absolute bottom-full right-0 mb-1 w-48 rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[240px] overflow-y-auto"
                          style={{ background: "var(--ps-bg-deep)", border: "1px solid var(--ps-border)" }}
                        >
                          {fallbackProvider && (
                            <button
                              onClick={() => { setFallbackProvider(null); setFallbackModelId(""); setShowFallbackProviderPicker(false); }}
                              className="w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 text-left hover:bg-[rgba(255,255,255,0.05)]"
                              style={{ color: "var(--ps-red)" }}
                            >
                              ✕ Remover fallback
                            </button>
                          )}
                          {availableProviders.map(prov => (
                            <button
                              key={prov.id}
                              onClick={() => { setFallbackProvider(prov.id); setFallbackModelId(""); setShowFallbackProviderPicker(false); }}
                              className={`w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${fallbackProvider === prov.id ? "bg-[var(--ps-accent-subtle)]" : "hover:bg-[rgba(255,255,255,0.05)]"}`}
                              style={{ color: fallbackProvider === prov.id ? "var(--ps-green)" : "var(--ps-cream-80)" }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--ps-green)" }} />
                              <span>{prov.label}</span>
                              <span className="text-[9px] opacity-40 ml-auto">{prov.models.filter(m => m.chatAllowed && !m.deprecated).length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback Model picker */}
                  {fallbackProvider && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => { setShowProviderPicker(false); setShowModelPicker(false); setShowMobilePlus(false); setShowFallbackProviderPicker(false); setShowFallbackPicker(prev => !prev); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors"
                        style={{
                          background: fallbackModelId ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                          borderColor: fallbackModelId ? "rgba(52,211,153,0.3)" : "var(--ps-border)",
                          color: fallbackModelId ? "var(--ps-green)" : "var(--ps-cream-40)",
                        }}
                        title="Modelo de fallback"
                      >
                        {fallbackModelDef?.label || "Modelo"}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showFallbackPicker && (
                        <div
                          className="absolute bottom-full right-0 mb-1 w-56 rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[280px] overflow-y-auto"
                          style={{ background: "var(--ps-bg-deep)", border: "1px solid var(--ps-border)" }}
                        >
                          {fallbackProviderModels.length === 0 ? (
                            <div className="px-2 py-3 text-center text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
                              Nenhum modelo disponível
                            </div>
                          ) : fallbackProviderModels.map(model => (
                            <button
                              key={model.id}
                              onClick={() => { setFallbackModelId(model.id); setShowFallbackPicker(false); }}
                              className={`w-full px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${fallbackModelId === model.id ? "bg-[var(--ps-accent-subtle)]" : "hover:bg-[rgba(255,255,255,0.05)]"}`}
                              style={{ color: fallbackModelId === model.id ? "var(--ps-green)" : "var(--ps-cream-80)" }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: model.quality === "very-high" ? "#f59e0b" : model.quality === "high" ? "#3b82f6" : "var(--ps-cream-25)" }} />
                              <span className="truncate flex-1">{model.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setReasoningMode(prev => !prev)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors shrink-0"
                    style={{
                      background: reasoningMode ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                      borderColor: reasoningMode ? "rgba(139,92,246,0.4)" : "var(--ps-border)",
                      color: reasoningMode ? "#a78bfa" : "var(--ps-cream-40)",
                    }}
                    title={reasoningMode ? "Raciocínio ativado — o modelo pensará antes de responder" : "Ativar modo raciocínio (chain-of-thought)"}
                  >
                    <Brain className="w-3 h-3" />
                    <span className="hidden sm:inline">{reasoningMode ? "Reason ON" : "Reason"}</span>
                  </button>
                  {/* Char count */}
                  <span className="text-[10px] ps-mono shrink-0" style={{ color: "var(--ps-cream-25)" }}>
                    {prompt.length}/500
                  </span>

                  {/* Mic button */}
                  {whisperSTT.isRecording ? (
                    <button
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-all animate-pulse"
                      style={{ background: "rgba(224,92,92,0.2)", border: "1px solid rgba(224,92,92,0.4)" }}
                      onClick={whisperSTT.stop}
                      title="Parar gravação"
                    >
                      <Square className="w-3.5 h-3.5" style={{ color: "#E05C5C" }} />
                    </button>
                  ) : whisperSTT.isProcessing ? (
                    <div
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
                      style={{ background: "rgba(59,130,246,0.15)", border: "1px solid var(--ps-accent-glow)" }}
                    >
                      <div className="w-3.5 h-3.5 rounded-full animate-spin" style={{ border: "2px solid var(--ps-accent)", borderTopColor: "transparent" }} />
                    </div>
                  ) : (
                    <button
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-105"
                      style={{ background: "rgba(59,130,246,0.15)", border: "1px solid var(--ps-accent-glow)", color: "var(--ps-accent)" }}
                      onClick={whisperSTT.start}
                      title="Ditar por voz"
                      disabled={!whisperSTT.isSupported}
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Send button */}
                  {canLaunch && (
                    <button
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                      style={{ background: "var(--ps-accent)", color: "#000" }}
                      onClick={() => onLaunch({ prompt, qualityModel: selectedModelId, fallbackModelId: fallbackModelId || undefined, reasoningMode, contextFiles: contextFiles.length > 0 ? contextFiles : undefined })}
                      title="Criar agente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {validationMessage && (
                  <div className="mt-2 text-[9px]" style={{ color: "var(--ps-orange)" }}>
                    {validationMessage}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Phase Flow Indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="w-full max-w-[800px] mt-5 overflow-x-auto scrollbar-thin scrollbar-thumb-[var(--ps-border)] scrollbar-track-transparent"
          >
            <div className="flex items-center justify-start sm:justify-center min-w-max px-2 sm:px-0">
              {[
                { icon: "🧠", label: "Descoberta", phase: "discovery" },
                { icon: "🔍", label: "Clarificação", phase: "clarification" },
                { icon: "📋", label: "Planejamento", phase: "planning" },
                { icon: "✅", label: "Aprovação", phase: "approval" },
                { icon: "🔨", label: "Construção", phase: "building" },
                { icon: "🧪", label: "Testes", phase: "testing" },
                { icon: "👁️", label: "Revisão", phase: "review" },
                { icon: "🚀", label: "Deploy", phase: "deploying" },
                { icon: "🏆", label: "Concluído", phase: "complete" },
              ].map((phase, i, arr) => {
                const isActive = resumeSession?.phase === phase.phase;
                const resumePhaseIdx = resumeSession?.phase
                  ? ["discovery","clarification","planning","approval","building","testing","review","deploying","complete"].indexOf(resumeSession.phase)
                  : -1;
                const phaseIdx = ["discovery","clarification","planning","approval","building","testing","review","deploying","complete"].indexOf(phase.phase);
                const isPast = resumePhaseIdx >= 0 && phaseIdx < resumePhaseIdx;

                return (
                  <div key={phase.label} className="flex items-center">
                    <span
                      className="ps-tool-btn text-[10px] whitespace-nowrap"
                      style={{
                        background: isActive ? "rgba(59,130,246,0.2)" : isPast ? "rgba(52,211,153,0.1)" : undefined,
                        color: isActive ? "var(--ps-accent)" : isPast ? "var(--ps-green)" : undefined,
                        borderColor: isActive ? "rgba(59,130,246,0.3)" : isPast ? "rgba(52,211,153,0.2)" : undefined,
                      }}
                    >
                      <span className="mr-0.5">{phase.icon}</span>{phase.label}
                    </span>
                    {i < arr.length - 1 && (
                      <ChevronRight className="w-3 h-3 mx-0.5 flex-shrink-0" style={{ color: "var(--ps-cream-15)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </section>

        {/* ═══ LANDING SECTIONS (extracted) ═══ */}
        <PrometheusHomeLanding
          onTemplateSelect={handleTemplateSelect}
          recentAgents={recentAgents}
          onOpenAgent={onOpenAgent || onOpenBuilderWithFlow}
          onDeleteAgent={onDeleteAgent}
        />
      </div>
    </div>
  );
}
