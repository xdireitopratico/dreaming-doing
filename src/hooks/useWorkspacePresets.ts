// useWorkspacePresets.ts — Hook de layout presets: salva/restaura configuração de painéis
// Layout presets: "default" (30/70), "focus-code" (0/100), "review" (50/50)
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import JSZip from "jszip";
import fileSaver from "file-saver";

const { saveAs } = fileSaver;

export interface WorkspacePreset {
  id: string;
  label: string;
  icon: string;
  leftRatio: number;
  showFileTree: boolean;
  activeView: "code" | "preview" | "diff";
}

const PRESETS: WorkspacePreset[] = [
  {
    id: "default",
    label: "Chat + Preview",
    icon: "◫",
    leftRatio: 30,
    showFileTree: false,
    activeView: "preview",
  },
  {
    id: "focus-code",
    label: "Focus Code",
    icon: "▣",
    leftRatio: 20,
    showFileTree: true,
    activeView: "code",
  },
  {
    id: "review",
    label: "Review",
    icon: "◧",
    leftRatio: 50,
    showFileTree: false,
    activeView: "diff",
  },
  {
    id: "full-preview",
    label: "Full Preview",
    icon: "▢",
    leftRatio: 20,
    showFileTree: false,
    activeView: "preview",
  },
  {
    id: "minimal-chat",
    label: "Minimal Chat",
    icon: "◨",
    leftRatio: 15,
    showFileTree: true,
    activeView: "code",
  },
];

export function useWorkspacePresets() {
  const [currentPreset, setCurrentPreset] = useState<WorkspacePreset>(PRESETS[0]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) setCurrentPreset(preset);
  }, []);

  const presets = PRESETS;

  return { presets, currentPreset, applyPreset };
}

// ---------------------------------------------------------------------------
// Export/Import project as ZIP
// ---------------------------------------------------------------------------

/** Download all project files as a ZIP */
export async function exportProjectZip(projectId: string, projectName: string) {
  try {
    const { data: files } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);

    if (!files || files.length === 0) {
      toast.error("Nenhum arquivo para exportar");
      return;
    }

    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.path, file.content ?? "");
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${projectName || "projeto"}.zip`);
  } catch (e: any) {
    toast.error(`Erro ao exportar: ${e.message}`);
  }
}

/** Handle file drop on the editor area for import */
export function useFileDrop(onFilesDropped: (files: File[]) => void) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesDropped(droppedFiles);
    },
    [onFilesDropped],
  );

  return { isDragOver, handleDragOver, handleDragLeave, handleDrop };
}
