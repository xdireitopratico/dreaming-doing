import { getFileIcon } from "@/components/editor/fileIcons";
import { cn } from "@/lib/utils";
import type { StepFileRef } from "@/lib/agent-job-stream";

type FileRefChipProps = {
  file: StepFileRef;
  onOpenFile?: (path: string) => void;
  variant?: "full" | "mini";
};

export function FileRefChip({ file, onOpenFile, variant = "full" }: FileRefChipProps) {
  const icon = getFileIcon(file.path);
  const clickable = !!onOpenFile;

  const inner = (
    <>
      <span className="lovable-file-ref-chip-kind">arquivo</span>
      <span className="lovable-file-ref-chip-sep" aria-hidden>
        ·
      </span>
      <span className="lovable-file-ref-chip-lang" style={{ color: icon.color }}>
        {file.langLabel}
      </span>
      <span className="lovable-file-ref-chip-sep" aria-hidden>
        ·
      </span>
      <span className="lovable-file-ref-chip-name font-mono">{file.fileName}</span>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className={cn("lovable-file-ref-chip", variant === "mini" && "lovable-file-ref-chip--mini")}
        onClick={() => onOpenFile(file.path)}
        title={file.path}
      >
        {inner}
      </button>
    );
  }

  return (
    <span
      className={cn("lovable-file-ref-chip", variant === "mini" && "lovable-file-ref-chip--mini")}
      title={file.path}
    >
      {inner}
    </span>
  );
}
