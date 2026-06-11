// useRollback.ts — Hook para snapshots automáticos + restauração
// Cria snapshot após cada resposta do agente, permite restaurar via UI
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

interface RollbackPoint {
  id: string;
  messageId: string;
  label: string;
  created_at: string;
  tree: Record<string, string>;
}

interface UseRollbackOptions {
  projectId: string;
  /** Whether rollback is available (messages loaded, not running) */
  enabled: boolean;
}

export function useRollback({ projectId, enabled }: UseRollbackOptions) {
  const [rollbackPoints, setRollbackPoints] = useState<RollbackPoint[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const autoSnapshotTaken = useRef(new Set<string>());

  // Load existing rollback points
  const loadRollbackPoints = useCallback(async () => {
    const { data } = await supabase
      .from("project_snapshots")
      .select("id, label, created_at, tree, meta")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (data) {
      const points = data.map((s: any) => ({
        id: s.id,
        messageId: s.meta?.message_id ?? "",
        label: s.label ?? "",
        created_at: s.created_at,
        tree: s.tree as Record<string, string>,
      }));
      setRollbackPoints(points as RollbackPoint[]);
      points.forEach((s: any) => autoSnapshotTaken.current.add(s.id));
    }
  }, [projectId]);

  useEffect(() => {
    if (enabled) loadRollbackPoints();
  }, [enabled, loadRollbackPoints]);

  // Create snapshot from current files
  const createSnapshot = useCallback(
    async (label: string) => {
      // Load current files
      const { data: files } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("project_id", projectId);

      if (!files || files.length === 0) return null;

      const tree: Record<string, string> = {};
      files.forEach((f) => {
        tree[f.path] = f.content ?? "";
      });

      const { data: snapshot, error } = await supabase
        .from("project_snapshots")
        .insert({
          project_id: projectId,
          label,
          tree: tree as any,
        })
        .select("id, label, created_at, tree")
        .single();

      if (error) {
        console.error("Failed to create snapshot:", error);
        return null;
      }

      const point = snapshot as RollbackPoint;
      setRollbackPoints((prev) => [...prev, point]);
      autoSnapshotTaken.current.add(point.id);
      return point;
    },
    [projectId],
  );

  // Auto-create snapshot after agent finishes (called from editor)
  const autoSnapshotAfterAgent = useCallback(
    async (label: string) => {
      if (!enabled) return;
      return createSnapshot(label);
    },
    [enabled, createSnapshot],
  );

  // Restore to a rollback point
  const restoreToPoint = useCallback(
    async (pointId: string) => {
      setIsRestoring(true);
      try {
        const point = rollbackPoints.find((p) => p.id === pointId);
        if (!point) throw new Error("Snapshot não encontrado");

        // Delete all current files
        const { data: existing } = await supabase
          .from("project_files")
          .select("id")
          .eq("project_id", projectId);

        if (existing && existing.length > 0) {
          await supabase.from("project_files").delete().eq("project_id", projectId);
        }

        // Insert restored files
        const inserts = Object.entries(point.tree).map(([path, content]) => ({
          project_id: projectId,
          path,
          content,
        }));

        const { error } = await supabase.from("project_files").upsert(inserts);

        if (error) throw error;

        return true;
      } catch (e: any) {
        toast.error(`Erro ao restaurar: ${e.message}`);
        return false;
      } finally {
        setIsRestoring(false);
      }
    },
    [projectId, rollbackPoints],
  );

  return {
    rollbackPoints,
    isRestoring,
    createSnapshot,
    autoSnapshotAfterAgent,
    restoreToPoint,
    loadRollbackPoints,
  };
}
