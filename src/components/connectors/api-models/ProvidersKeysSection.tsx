import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, ChevronDown, ChevronRight, Plus, ExternalLink, Trash2 } from "lucide-react";
import {
  allProviders,
  providerById,
  providerIcon,
  type AiProviderId,
  type CustomProviderId,
} from "@/lib/ai-provider-registry";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { ApiKeyPoolSection } from "@/components/connectors/ApiKeyPoolSection";
import { Button } from "@/components/ui/button";
import { AddProviderModal } from "./AddProviderModal";
import type { ProviderUiState } from "./ApiModelsPage";

interface ProviderKeyCardProps {
  state: ProviderUiState;
  savingId: string | null;
  pulse: boolean;
  onKeyChange: (id: AiProviderId, value: string) => void;
  onBaseUrlChange: (id: AiProviderId, value: string) => void;
  onSave: (id: AiProviderId, appendPool: boolean) => void;
  onRemoveSlot: (id: AiProviderId, keyId: string) => void;
  onDelete: (id: AiProviderId) => void;
}

function ProviderKeyCard({
  state,
  savingId,
  pulse,
  onKeyChange,
  onBaseUrlChange,
  onSave,
  onRemoveSlot,
  onDelete,
}: ProviderKeyCardProps) {
  const prov = providerById(state.id);
  if (!prov) return null;
  const Icon = providerIcon(prov.icon);
  const hasPool = (state.poolCount ?? 0) > 0 || (state.poolSlots?.length ?? 0) > 0;
  const isOllama = prov.id === "ollama";
  const isCustom = prov.id.startsWith("custom-");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30"
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`size-10 rounded-lg border grid place-items-center shrink-0 ${
            state.status === "connected"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]"
          }`}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-mono text-[13px]">{prov.label}</h3>
            {state.status === "connected" && (
              <span className="font-mono text-[8px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
                {hasPool ? `POOL · ${state.poolCount} chaves` : "CONECTADO"}
              </span>
            )}
            {prov.costPerM === 0 && (
              <span className="font-mono text-[8px] text-emerald-400/70">GRATUITO</span>
            )}
          </div>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">
            {isOllama
              ? "Endpoint local OpenAI-compatible"
              : `${prov.baseUrl} · ${prov.keyPrefix}...`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {prov.docUrl && (
            <a
              href={prov.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grid size-7 place-items-center rounded-md text-[var(--text-ghost)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onDelete(state.id)}
            disabled={savingId === state.id}
            className="grid size-7 place-items-center rounded-md text-[var(--text-ghost)] hover:bg-[var(--surface-2)] hover:text-[var(--destructive)] disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {prov.supportsPool && hasPool && (
          <ApiKeyPoolSection
            poolSlots={state.poolSlots ?? []}
            poolCount={state.poolCount ?? 0}
            pulse={pulse}
            busy={savingId === state.id}
            onRemoveSlot={(keyId) => onRemoveSlot(state.id, keyId)}
            onRemoveAll={() => onDelete(state.id)}
          />
        )}

        {isOllama && (
          <div className="grid gap-2 sm:grid-cols-2 mb-2">
            <div>
              <label className="font-mono text-[9px] text-[var(--text-dim)]">URL base</label>
              <input
                type="text"
                value={state.baseUrl}
                onChange={(e) => onBaseUrlChange(state.id, e.target.value)}
                placeholder="https://seu-tunnel.ngrok.app"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] text-[var(--text-dim)]">Modelo padrão</label>
              <input
                type="text"
                value={state.keyValue}
                onChange={(e) => onKeyChange(state.id, e.target.value)}
                placeholder="llama3.2"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
              />
            </div>
          </div>
        )}

        {!isOllama && (
          <ApiKeyInput
            label={`Chave ${prov.label}`}
            value={state.keyValue}
            onChange={(v) => onKeyChange(state.id, v)}
            onDelete={state.status === "connected" ? () => onDelete(state.id) : undefined}
            provider={prov.id}
            placeholder={prov.keyPlaceholder}
            saved={state.status === "connected"}
            disabled={savingId === state.id}
          />
        )}

        <div className="flex flex-wrap gap-2 mt-1">
          <Button
            type="button"
            size="sm"
            className="bg-[var(--primary)] text-[#0a0a0a]"
            disabled={savingId === state.id || !state.keyValue.trim() || (isOllama && !state.baseUrl.trim())}
            onClick={() => onSave(state.id, false)}
          >
            {savingId === state.id
              ? "Salvando…"
              : hasPool && prov.supportsPool && !isOllama
                ? "Substituir tudo"
                : "Salvar"}
          </Button>
          {prov.supportsPool && !isOllama && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingId === state.id || !state.keyValue.trim()}
              onClick={() => onSave(state.id, true)}
            >
              {savingId === state.id ? "Adicionando…" : "Adicionar ao pool"}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface ProvidersKeysSectionProps {
  providers: ProviderUiState[];
  savingId: string | null;
  pulseId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onKeyChange: (id: AiProviderId, value: string) => void;
  onBaseUrlChange: (id: AiProviderId, value: string) => void;
  onSave: (id: AiProviderId, appendPool: boolean) => void;
  onRemoveSlot: (id: AiProviderId, keyId: string) => void;
  onDelete: (id: AiProviderId) => void;
}

export function ProvidersKeysSection({
  providers,
  savingId,
  pulseId,
  expanded,
  onToggle,
  onKeyChange,
  onBaseUrlChange,
  onSave,
  onRemoveSlot,
  onDelete,
}: ProvidersKeysSectionProps) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--surface-2)]/40 transition-colors"
      >
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)]">
          <Key className="size-3 text-[var(--primary)]" />
          2 · Providers & Keys
        </h2>
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              <div className="flex justify-end mb-4">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAddOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Adicionar provider
                </Button>
              </div>

              <div className="space-y-3">
                {providers.map((p) => (
                  <ProviderKeyCard
                    key={p.id}
                    state={p}
                    savingId={savingId}
                    pulse={pulseId === p.id}
                    onKeyChange={onKeyChange}
                    onBaseUrlChange={onBaseUrlChange}
                    onSave={onSave}
                    onRemoveSlot={onRemoveSlot}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddProviderModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => window.dispatchEvent(new Event("forge:prefs-updated"))}
      />
    </section>
  );
}
