import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Globe } from "lucide-react";
import { getQualityColor, type LibraryEntry } from "./types";

interface DesignLibraryDetailProps {
  entry: LibraryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DesignLibraryDetail({ entry, open, onOpenChange }: DesignLibraryDetailProps) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">{entry.name}</DialogTitle>
              <a
                href={entry.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
              >
                {entry.source_url}
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getQualityColor(entry.quality_score)}`}
              >
                Qualidade {entry.quality_score.toFixed(1)}
              </span>
              {entry.validated && (
                <Badge
                  variant="default"
                  className="bg-green-500/20 text-green-400 border-green-500/30"
                >
                  Validado
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="preview" className="flex-1 flex flex-col">
            <div className="px-6 pt-3 border-b border-border">
              <TabsList className="h-8">
                <TabsTrigger value="preview" className="text-xs h-7">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="dna" className="text-xs h-7">
                  Design DNA
                </TabsTrigger>
                <TabsTrigger value="markdown" className="text-xs h-7">
                  Markdown
                </TabsTrigger>
                <TabsTrigger value="meta" className="text-xs h-7">
                  Metadata
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview" className="flex-1 overflow-auto p-6 m-0">
              {entry.screenshot_url ? (
                <div className="rounded-lg overflow-hidden border border-border bg-surface-2">
                  <img src={entry.screenshot_url} alt={entry.name} className="w-full h-auto" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <Globe className="size-8 mx-auto mb-2" />
                    <p className="text-sm">Sem screenshot</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="dna" className="flex-1 overflow-auto p-6 m-0">
              {entry.design_dna ? (
                <pre className="text-xs font-mono bg-surface-2 rounded-lg p-4 overflow-x-auto">
                  {JSON.stringify(entry.design_dna, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">Design DNA não disponível</p>
              )}
            </TabsContent>

            <TabsContent value="markdown" className="flex-1 overflow-auto p-6 m-0">
              {entry.raw_markdown ? (
                <pre className="text-xs font-mono bg-surface-2 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
                  {entry.raw_markdown.slice(0, 20000)}
                  {entry.raw_markdown.length > 20000 && "\n\n… (truncado)"}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">Markdown não disponível</p>
              )}
            </TabsContent>

            <TabsContent value="meta" className="flex-1 overflow-auto p-6 m-0 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground mb-1">Categoria</p>
                  <Badge variant="secondary">{entry.category}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Quality Source</p>
                  <p>{entry.quality_source}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Extraído em</p>
                  <p>{new Date(entry.extracted_at).toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Visualizações</p>
                  <p>{entry.view_count}</p>
                </div>
              </div>

              {entry.serves_domains.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Serve domínios</p>
                  <div className="flex flex-wrap gap-1">
                    {entry.serves_domains.map((d) => (
                      <Badge key={d} variant="outline">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {entry.compatible_languages.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Linguagens compatíveis</p>
                  <div className="flex flex-wrap gap-1">
                    {entry.compatible_languages.map((l) => (
                      <Badge key={l} variant="outline">
                        {l}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {entry.compatible_moods.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Moods</p>
                  <div className="flex flex-wrap gap-1">
                    {entry.compatible_moods.map((m) => (
                      <Badge key={m} variant="outline" className="border-accent/30 text-accent">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {entry.tags.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {entry.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Notas</p>
                  <p className="text-sm">{entry.notes}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
