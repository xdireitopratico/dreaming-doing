import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Archive, Trash2, ExternalLink, Globe } from "lucide-react";
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
    <Card className={`group overflow-hidden flex flex-col bg-surface-1 border-border hover:border-primary/30 transition-colors ${duplicateCount > 0 ? "ring-1 ring-amber-500/15" : ""}`}>
      <div className="relative aspect-video bg-surface-3 overflow-hidden">
        {entry.screenshot_url ? (
          <img
            src={entry.screenshot_url}
            alt={entry.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-surface-3 to-accent/20 flex items-center justify-center">
            <Globe className="size-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1.5">
          {variantCount > 1 && (
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-amber-400">
              +{variantCount - 1}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${getQualityColor(entry.quality_score)}`}
          >
            {entry.quality_score.toFixed(1)}
          </span>
          {entry.validated && (
            <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 text-green-400 px-2 py-0.5 text-[10px] font-semibold leading-none">
              ✓
            </span>
          )}
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate" title={entry.name}>
            {entry.name}
          </h3>
          <a
            href={entry.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground hover:text-primary truncate flex items-center gap-1 mt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {truncate(entry.source_url, 40)}
            <ExternalLink className="size-2.5 shrink-0" />
          </a>
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {entry.category}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {entry.ingest_kind}
          </Badge>
          {duplicateCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">
              {variantCount} versões
            </Badge>
          )}
          {entry.serves_domains.slice(0, 2).map((d) => (
            <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">
              {d}
            </Badge>
          ))}
          {entry.compatible_moods.slice(0, 1).map((m) => (
            <Badge
              key={m}
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-accent/30 text-accent"
            >
              {m}
            </Badge>
          ))}
          {relatedKinds.slice(0, 3).map((kind) => (
            <Badge key={kind} variant="secondary" className="text-[10px] px-1.5 py-0 opacity-80">
              {kind}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1 pt-1 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={onView} className="h-7 text-[11px] flex-1">
            Ver
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onValidate}
            className="h-7 w-7 p-0"
            title={entry.validated ? "Desvalidar" : "Validar"}
          >
            <Check className={`size-3 ${entry.validated ? "text-green-500" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onArchive}
            className="h-7 w-7 p-0"
            title="Arquivar"
          >
            <Archive className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="Excluir"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
