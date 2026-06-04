import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Lock, Server, ShieldAlert, Trash2 } from "lucide-react";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { Button } from "@/components/ui/button";
import { PLATFORM_SECRET_DEFINITIONS } from "@/lib/platform-secrets-config";
import {
  deleteAdminPlatformSecret,
  fetchAdminSecretStatus,
  type PlatformSecretStatus,
  upsertAdminPlatformSecret,
} from "@/lib/admin-platform-secrets";

export function AdminPlatformSecretsPanel() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-platform-secrets"],
    queryFn: fetchAdminSecretStatus,
    retry: false,
  });

  const statusByName = useCallback(
    (name: string): PlatformSecretStatus | undefined =>
      data?.secrets.find((s) => s.name === name),
    [data?.secrets],
  );

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : "Falha ao carregar secrets");
  }, [error]);

  const handleSave = async (name: string) => {
    const value = drafts[name]?.trim();
    if (!value) {
      toast.error("Cole o valor antes de salvar");
      return;
    }
    setSaving(name);
    try {
      await upsertAdminPlatformSecret(name, value);
      setDrafts((d) => ({ ...d, [name]: "" }));
      await qc.invalidateQueries({ queryKey: ["admin-platform-secrets"] });
      toast.success(`${name} salvo — Edge Functions usam na próxima invocação`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (name: string) => {
    setSaving(name);
    try {
      await deleteAdminPlatformSecret(name);
      await qc.invalidateQueries({ queryKey: ["admin-platform-secrets"] });
      toast.success(`${name} removido do vault FORGE`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setSaving(null);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="size-10 rounded-lg border border-amber-400/30 bg-amber-400/10 grid place-items-center shrink-0">
          <Server className="size-5 text-amber-400" />
        </div>
        <div>
          <h2 className="font-mono text-[12px] text-[var(--foreground)] flex items-center gap-2">
            <Lock className="size-3.5" />
            Secrets globais do projeto
          </h2>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed max-w-xl">
            Equivalente ao ambiente de secrets do Lovable. Valores ficam no banco cifrado por RLS
            (só Edge Functions com service role). Nunca voltam ao browser após salvar. Apenas{" "}
            <strong className="text-amber-400/90">xdireitopratico@gmail.com</strong>.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)]/60">
        <ShieldAlert className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="font-mono text-[8px] text-[var(--text-dim)] leading-relaxed">
          Prioridade: valor salvo aqui → fallback Supabase Edge Secrets (env). Chaves de usuário em
          /api-keys continuam tendo prioridade no agente por usuário.
        </p>
      </div>

      {isLoading && (
        <p className="font-mono text-[10px] text-[var(--text-ghost)]">Carregando vault…</p>
      )}

      <div className="space-y-4">
        {PLATFORM_SECRET_DEFINITIONS.map((def) => {
          const st = statusByName(def.name);
          const configured = st?.configured ?? false;
          return (
            <div
              key={def.name}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)]/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-[11px] text-[var(--foreground)]">{def.label}</span>
                <code className="font-mono text-[8px] text-[var(--primary)] px-1.5 py-0.5 rounded bg-[var(--primary)]/10">
                  {def.name}
                </code>
                {configured && (
                  <span className="font-mono text-[8px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
                    {st?.hint ? `ATIVO · ${st.hint}` : "ATIVO"}
                  </span>
                )}
                {st?.fromEdgeEnv && !configured && (
                  <span className="font-mono text-[8px] text-[var(--text-ghost)]">só env Supabase</span>
                )}
              </div>
              <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">{def.description}</p>
              <ApiKeyInput
                label={`Valor ${def.name}`}
                value={drafts[def.name] ?? ""}
                onChange={(v) => setDrafts((d) => ({ ...d, [def.name]: v }))}
                onDelete={configured ? () => void handleDelete(def.name) : undefined}
                provider={def.label}
                placeholder={def.placeholder ?? "••••••••"}
                saved={configured}
                disabled={saving === def.name}
              />
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-[var(--primary)] text-[#0a0a0a]"
                  disabled={saving === def.name || !drafts[def.name]?.trim()}
                  onClick={() => void handleSave(def.name)}
                >
                  {saving === def.name ? "Salvando…" : configured ? "Atualizar secret" : "Salvar secret"}
                </Button>
                {configured && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-2 text-red-400 hover:text-red-300"
                    disabled={saving === def.name}
                    onClick={() => void handleDelete(def.name)}
                  >
                    <Trash2 className="size-3.5 mr-1" />
                    Remover
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}