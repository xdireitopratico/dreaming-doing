// CreateProjectDialog.tsx — Modal de criação de projeto novo
// Fluxo: nome + descrição + template + primeiro prompt → createProjectFromPrompt (server fn) → editor
import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FolderOpen, Loader2, ArrowRight,
  Globe, Layout, Package, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createProjectFromPrompt } from "@/lib/projects.functions";

import { toast } from "@/lib/toast";
import { ForgeIcon } from "@/components/icons/ForgeIcon";

type Template = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
};

const TEMPLATES: Template[] = [
  {
    id: "vite-react",
    name: "React + Vite",
    description: "SPA moderna com React 19 e Vite",
    icon: Zap,
    prompt: "Cria uma aplicação React com Vite, Tailwind CSS e TypeScript.",
  },
  {
    id: "landing-page",
    name: "Landing Page",
    description: "Página de conversão com animações",
    icon: Globe,
    prompt: "Cria uma landing page moderna com seções: hero, features, depoimentos e CTA.",
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Painel admin com gráficos e métricas",
    icon: Layout,
    prompt: "Cria um dashboard admin com React, Tailwind CSS e gráficos com Recharts.",
  },
  {
    id: "fullstack-supabase",
    name: "Fullstack Supabase",
    description: "CRUD completo com auth + banco",
    icon: Package,
    prompt: "Cria um app fullstack React + Supabase com autenticação, CRUD e Row Level Security.",
  },
];

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const navigate = useNavigate();
  const createProject = useServerFn(createProjectFromPrompt);
  const [step, setStep] = useState<"template" | "details" | "creating">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [firstPrompt, setFirstPrompt] = useState("");

  const handleTemplateSelect = useCallback((template: Template) => {
    setSelectedTemplate(template);
    setName(template.name);
    setFirstPrompt(template.prompt);
    setStep("details");
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Dê um nome ao projeto");
      return;
    }

    setStep("creating");

    try {
      const res = await createProject({
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          template: selectedTemplate?.id,
          firstPrompt:
            firstPrompt.trim() || selectedTemplate?.prompt || description.trim() || undefined,
        },
      });

      navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar projeto");
      setStep("details");
    }
  }, [name, description, firstPrompt, selectedTemplate, navigate, createProject, onClose]);

  const handleClose = () => {
    if (step === "creating") return;
    setStep("template");
    setSelectedTemplate(null);
    setName("");
    setDescription("");
    setFirstPrompt("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-2xl bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-[0_0_60px_-20px_rgba(255,182,39,0.15)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
                  <FolderOpen className="size-4 text-[var(--primary)]" />
                </div>
                <div>
                  <h2 className="text-base font-display text-[var(--foreground)]">
                    Novo Projeto
                  </h2>
                  <p className="text-[10px] font-mono text-[var(--text-ghost)] uppercase tracking-wider">
                    {step === "template" ? "Escolha um template" : step === "details" ? "Configure seu projeto" : "Criando..."}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={step === "creating"}
                className="p-2 rounded-lg text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-30"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <AnimatePresence mode="wait">
                {step === "template" && (
                  <motion.div
                    key="templates"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    {TEMPLATES.map((template) => {
                      const Icon = template.icon;
                      return (
                        <button
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/40 hover:bg-[var(--surface-2)]/50 transition-all text-left group"
                        >
                          <div className="size-10 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center shrink-0 group-hover:border-[var(--primary)]/30 transition-colors">
                            <Icon className="size-5 text-[var(--text-dim)] group-hover:text-[var(--primary)] transition-colors" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-display text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                              {template.name}
                            </p>
                            <p className="text-[10px] text-[var(--text-dim)] mt-0.5 line-clamp-2">
                              {template.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}

                {step === "details" && (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {/* Nome */}
                    <div>
                      <label className="block text-[10px] font-mono text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                        Nome do projeto
                      </label>
                      <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Meu App Incrível"
                        className="w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--primary)]/40 focus:ring-1 focus:ring-[var(--primary)]/20 text-sm font-body text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreate();
                        }}
                      />
                    </div>

                    {/* Descrição */}
                    <div>
                      <label className="block text-[10px] font-mono text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                        Descrição <span className="text-[var(--text-ghost)]">(opcional)</span>
                      </label>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Breve descrição do que esse projeto faz"
                        className="w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--primary)]/40 focus:ring-1 focus:ring-[var(--primary)]/20 text-sm font-body text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none transition-colors"
                      />
                    </div>

                    {/* Primeiro prompt */}
                    <div>
                      <label className="block text-[10px] font-mono text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
                        Primeira instrução <span className="text-[var(--text-ghost)]">(opcional)</span>
                      </label>
                      <textarea
                        value={firstPrompt}
                        onChange={(e) => setFirstPrompt(e.target.value)}
                        placeholder="Descreva o que o agente deve construir..."
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--primary)]/40 focus:ring-1 focus:ring-[var(--primary)]/20 text-sm font-body text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none transition-colors resize-none"
                      />
                    </div>

                    {/* Selected template */}
                    {selectedTemplate && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)]">
                        <span className="text-[10px] font-mono text-[var(--text-ghost)]">
                          Template:
                        </span>
                        <span className="text-[10px] font-mono text-[var(--foreground)]">
                          {selectedTemplate.name}
                        </span>
                        <button
                          onClick={() => { setStep("template"); setSelectedTemplate(null); }}
                          className="ml-auto text-[9px] font-mono text-[var(--text-dim)] hover:text-[var(--foreground)] transition-colors"
                        >
                          Mudar
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {step === "creating" && (
                  <motion.div
                    key="creating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 gap-4"
                  >
                    <div className="relative">
                      <div className="size-16 rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
                        <Loader2 className="size-6 text-[var(--primary)] animate-spin" />
                      </div>
                      <motion.div
                        className="absolute inset-0 rounded-2xl border-2 border-[var(--primary)]/30"
                        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-display text-[var(--foreground)]">
                        Criando seu projeto
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-ghost)] mt-1">
                        Preparando o ambiente...
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {step === "details" && (
              <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
                <button
                  onClick={() => setStep("template")}
                  className="text-[10px] font-mono text-[var(--text-dim)] hover:text-[var(--foreground)] transition-colors uppercase tracking-wider"
                >
                  ← Voltar
                </button>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-mono hover:bg-[var(--primary-hot)] transition-colors disabled:opacity-30"
                  disabled={!name.trim()}
                >
                  <ForgeIcon variant="build" size={14} />
                  Criar Projeto
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
