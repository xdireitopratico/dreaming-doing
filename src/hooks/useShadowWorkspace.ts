// useShadowWorkspace.ts — "Branch oculta" onde agente trabalha
// Agente faz mudanças. Só mostra diff final quando build passa.
// Inspiração: Cursor Shadow Workspace
import { useCallback, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DiffEntry } from "@/components/editor/AiDiffViewer";

interface ShadowState {
  /** Diffs pendentes para revisão */
  pendingDiffs: DiffEntry[];
  /** Se o shadow workspace está ativo (agente trabalhando) */
  isActive: boolean;
}

interface UseShadowWorkspaceOptions {
  projectId: string;
}

/**
 * Hook que gerencia um "shadow workspace" — o agente faz mudanças,
 * mas elas só são expostas quando build passa. Se falhar, descarta.
 */
export function useShadowWorkspace({ projectId }: UseShadowWorkspaceOptions) {
  const [state, setState] = useState<ShadowState>({
    pendingDiffs: [],
    isActive: false,
  });
  const originalFiles = useRef<Map<string, string>>(new Map());

  /** Captura snapshot dos arquivos atuais antes do agente começar */
  const beginShadowSession = useCallback(async () => {
    const { data } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);

    if (data) {
      originalFiles.current.clear();
      data.forEach((f) => originalFiles.current.set(f.path, f.content ?? ""));
    }

    setState({ pendingDiffs: [], isActive: true });
  }, [projectId]);

  /** Adiciona um diff ao shadow workspace */
  const addPendingDiff = useCallback((diff: DiffEntry) => {
    setState((prev) => ({
      ...prev,
      pendingDiffs: [...prev.pendingDiffs, diff],
    }));
  }, []);

  /** Aceita todos os diffs e finaliza a shadow session */
  const acceptAllDiffs = useCallback(() => {
    setState({ pendingDiffs: [], isActive: false });
  }, []);

  /** Rejeita todos os diffs — reverte arquivos ao estado original */
  const rejectAllDiffs = useCallback(async () => {
    // Restore original files
    const restores = Array.from(originalFiles.current.entries()).map(
      ([path, content]) =>
        supabase
          .from("project_files")
          .upsert({ project_id: projectId, path, content }),
    );

    await Promise.all(restores);
    setState({ pendingDiffs: [], isActive: false });
  }, [projectId]);

  /** Aceita um diff específico */
  const acceptDiff = useCallback((diffId: string) => {
    setState((prev) => ({
      ...prev,
      pendingDiffs: prev.pendingDiffs.filter((d) => d.id !== diffId),
    }));
  }, []);

  /** Rejeita um diff específico — reverte aquele arquivo */
  const rejectDiff = useCallback(
    async (diffId: string) => {
      const diff = state.pendingDiffs.find((d) => d.id === diffId);
      if (!diff) return;

      const original = originalFiles.current.get(diff.path);
      if (original !== undefined) {
        await supabase
          .from("project_files")
          .upsert({ project_id: projectId, path: diff.path, content: original });
      }

      setState((prev) => ({
        ...prev,
        pendingDiffs: prev.pendingDiffs.filter((d) => d.id !== diffId),
      }));
    },
    [projectId, state.pendingDiffs],
  );

  return {
    ...state,
    beginShadowSession,
    addPendingDiff,
    acceptAllDiffs,
    rejectAllDiffs,
    acceptDiff,
    rejectDiff,
  };
}
