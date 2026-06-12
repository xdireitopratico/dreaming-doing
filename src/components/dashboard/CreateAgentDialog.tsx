import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, X } from "lucide-react";
import { createProjectFromPrompt } from "@/lib/projects.functions";
import { toast } from "@/lib/toast";
import { ForgeIcon } from "@/components/icons/ForgeIcon";

interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAgentDialog({ open, onClose }: CreateAgentDialogProps) {
  const navigate = useNavigate();
  const createProject = useServerFn(createProjectFromPrompt);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, onClose, reset]);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Dê um nome ao agente");
      return;
    }

    setBusy(true);
    try {
      const res = await createProject({
        data: {
          kind: "agent",
          name: name.trim(),
          description: description.trim() || undefined,
          firstPrompt: description.trim() || `Criar agente: ${name.trim()}`,
        },
      });

      navigate({ to: "/agents/$agentId", params: { agentId: res.projectId } });
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar agente");
      setBusy(false);
    }
  }, [createProject, description, handleClose, name, navigate]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl border border-[var(--forge-border)] bg-[var(--forge-surface)] p-6 shadow-xl"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-[var(--forge-surface-2)]">
                  <ForgeIcon variant="agent" size={20} className="text-[var(--forge-primary)]" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-[var(--forge-text)]">Novo agente</h2>
                  <p className="text-xs text-[var(--forge-muted)]">
                    Fluxo visual AetherForge — sem código de site.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-[var(--forge-muted)] hover:bg-[var(--forge-surface-2)]"
                onClick={handleClose}
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="block text-xs font-medium text-[var(--forge-muted)]">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Suporte WhatsApp"
              className="mt-1.5 w-full rounded-xl border border-[var(--forge-border)] bg-[var(--forge-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--forge-border-strong)]"
              autoFocus
            />

            <label className="mt-4 block text-xs font-medium text-[var(--forge-muted)]">
              Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que este agente deve fazer?"
              rows={3}
              className="mt-1.5 w-full resize-none rounded-xl border border-[var(--forge-border)] bg-[var(--forge-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--forge-border-strong)]"
            />

            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => void handleCreate()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--forge-primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Criando…
                </>
              ) : (
                <>
                  Criar agente
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}