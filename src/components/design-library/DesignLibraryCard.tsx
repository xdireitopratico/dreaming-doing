import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Archive, Trash2, ExternalLink } from "lucide-react";
import { getQualityColor, type LibraryEntry } from "./types";

interface DesignLibraryCardProps {
  entry: LibraryEntry;
  onView: () => void;
  onValidate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  duplicateCount?: number;
  variantCount?: number;
  relatedKinds?: string[];
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + "…";
}

export function DesignLibraryCard({
  entry,
  onView,
  onValidate,
  onArchive,
  onDelete,
  duplicateCount = 0,
  variantCount = 1,
  relatedKinds = [],
}: DesignLibraryCardProps) {
  return (
    <Card
      className={`group overflow-hidden bg-surface-1 border-border hover:border-primary/30 transition-colors cursor-pointer ${duplicateCount > 0 ? "ring-1 ring-amber-500/15" : ""}`}
      onClick={onView}
    >
      <div className="p-2.5 flex flex-col gap-1.5">
        {/* Header: name + quality */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-medium truncate leading-tight" title={entry.name}>
              {entry.name}
            </h3>
            <a
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary truncate flex items-center gap-0.5 mt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {truncate(entry.source_url, 35)}
              <ExternalLink className="size-2 shrink-0" />
            </a>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {variantCount > 1 && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold leading-none text-amber-400">
                ×{variantCount}
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold leading-none ${getQualityColor(entry.quality_score)}`}
            >
              {entry.quality_score.toFixed(1)}
            </span>
            {entry.validated && (
              <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 text-green-400 px-1.5 py-0 text-[9px] font-semibold leading-none">
                ✓
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
            {entry.category}
          </Badge>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
            {entry.ingest_kind}
          </Badge>
          {entry.serves_domains.slice(0, 1).map((d) => (
            <Badge key={d} variant="outline" className="text-[9px] px-1.5 py-0 h-4">
              {d}
            </Badge>
          ))}
          {relatedKinds.slice(0, 2).map((kind) => (
            <Badge key={kind} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 opacity-80">
              {kind}
            </Badge>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 pt-1 border-t border-border/50 -mx-1 px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onValidate(); }}
            className="h-6 w-6 p-0"
            title={entry.validated ? "Desvalidar" : "Validar"}
          >
            <Check className={`size-2.5 ${entry.validated ? "text-green-500" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="h-6 w-6 p-0"
            title="Arquivar"
          >
            <Archive className="size-2.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            title="Excluir"
          >
            <Trash2 className="size-2.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
