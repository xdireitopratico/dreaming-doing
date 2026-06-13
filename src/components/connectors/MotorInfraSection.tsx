/**
 * MotorInfraSection — Infra compacta do motor Prometheus em /api
 * LLM: connectors (provedores abaixo). Firecrawl: platform_secrets (admin).
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, ExternalLink, Search, Brain } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { toast } from "@/lib/toast";
import {
  deleteMotorPlatformSecret,
  listMotorPlatformSecrets,
  upsertMotorPlatformSecret,
} from "@/lib/platform-secrets-api";

interface MotorInfraSectionProps {
  isAdmin: boolean;
  llmConnectedCount: number;
}

export function MotorInfraSection({ isAdmin, llmConnectedCount }: MotorInfraSectionProps) {
  const qc = useQueryClient();
  const [firecrawlValue, setFirecrawlValue] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: motorSecrets, isLoading } = useQuery({
    queryKey: ["motor-platform-secrets"],
    enabled: isAdmin,
    queryFn: listMotorPlatformSecrets,
  });

  const firecrawlStatus = motorSecrets?.find((s) => s.name === "FIRECRAWL_API_KEY");
  const firecrawlConfigured = !!(
    firecrawlStatus?.configured || firecrawlStatus?.fromEdgeEnv
  );

  useEffect(() => {
    if (!firecrawlConfigured) return;
    setFirecrawlValue("");
  }, [firecrawlConfigured]);

  const handleSaveFirecrawl = useCallback(async () => {
    if (!firecrawlValue.trim()) {
      toast.error("Cole a chave Firecrawl antes de salvar");
      return;
    }
    setSaving(true);
    try {
      await upsertMotorPlatformSecret("FIRECRAWL_API_KEY", firecrawlValue);
      setFirecrawlValue("");
      await qc.invalidateQueries({ queryKey: ["motor-platform-secrets"] });
      toast.success("Firecrawl salvo para o motor Prometheus");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar Firecrawl");
    } finally {
      setSaving(false);
    }
  }, [firecrawlValue, qc]);

  const handleDeleteFirecrawl = useCallback(async () => {
    setSaving(true);
    try {
      await deleteMotorPlatformSecret("FIRECRAWL_API_KEY");
      setFirecrawlValue("");
      await qc.invalidateQueries({ queryKey: ["motor-platform-secrets"] });
      toast.success("Firecrawl removido da plataforma");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover Firecrawl");
    } finally {
      setSaving(false);
    }
  }, [qc]);

  return (
    <motion.section
      id="forge-motor-infra"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 scroll-mt-24"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="size-9 rounded-lg border border-orange-400/25 bg-orange-400/10 grid place-items-center shrink-0 text-orange-400">
          <Flame className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--text-dim)]">
            Infra do motor Prometheus
          </h2>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">
            Wizard de construção de agentes: LLM via suas chaves abaixo; pesquisa web via Firecrawl
            (plataforma). Secrets de tools do agente ficam no editor (Secrets), não aqui.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Brain className="size-3.5 text-[var(--primary)]" />
            <span className="font-mono text-[10px] font-medium">LLM do motor</span>
            <span
              className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                llmConnectedCount > 0
                  ? "text-emerald-400 bg-emerald-400/10"
                  : "text-amber-400 bg-amber-400/10"
              }`}
            >
              {llmConnectedCount > 0 ? `${llmConnectedCount} provedor(es)` : "nenhuma chave"}
            </span>
          </div>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed">
            Cortex, Analyst e Scribe usam os provedores de IA desta página (Groq, Gemini, OpenRouter…).
          </p>
          <a
            href="#forge-key-groq"
            className="inline-block mt-2 font-mono text-[9px] text-[var(--primary)] hover:underline"
          >
            Ir para provedores →
          </a>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Search className="size-3.5 text-orange-400" />
            <span className="font-mono text-[10px] font-medium">Firecrawl (pesquisa web)</span>
            {isAdmin && !isLoading && (
              <span
                className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                  firecrawlConfigured
                    ? "text-emerald-400 bg-emerald-400/10"
                    : "text-amber-400 bg-amber-400/10"
                }`}
              >
                {firecrawlConfigured
                  ? firecrawlStatus?.hint ?? "configurado"
                  : "pendente"}
              </span>
            )}
          </div>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed mb-2">
            <code className="text-[var(--text-dim)]">research_web</code> e{" "}
            <code className="text-[var(--text-dim)]">fetch_page</code> no wizard.
          </p>

          {isAdmin ? (
            <>
              <ApiKeyInput
                label="FIRECRAWL_API_KEY"
                value={firecrawlValue}
                onChange={setFirecrawlValue}
                onDelete={firecrawlConfigured ? () => void handleDeleteFirecrawl() : undefined}
                provider="firecrawl"
                placeholder="fc-..."
                saved={firecrawlConfigured}
                disabled={saving}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[10px] bg-[var(--primary)] text-[#0a0a0a]"
                  disabled={saving || !firecrawlValue.trim()}
                  onClick={() => void handleSaveFirecrawl()}
                >
                  {saving ? "Salvando…" : firecrawlConfigured ? "Atualizar" : "Salvar"}
                </Button>
                <a
                  href="https://www.firecrawl.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] self-center"
                >
                  Docs <ExternalLink className="size-3 inline" />
                </a>
              </div>
            </>
          ) : (
            <p className="font-mono text-[9px] text-[var(--text-ghost)]">
              Chave global da plataforma — configure com o administrador FORGE se a pesquisa web falhar.
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}