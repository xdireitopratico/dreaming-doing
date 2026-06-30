import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, Loader2, LayoutGrid, List, Library, ChevronRight, Play, StopCircle, ChevronDown, ChevronUp, History, Briefcase, FolderOpen, Star, CheckCircle, TrendingUp } from "lucide-react";
import { useLibrary, useJobs } from "./hooks";
import { DesignLibraryFilters } from "./DesignLibraryFilters";
import { DesignLibraryCard } from "./DesignLibraryCard";
import { DesignLibraryDetail } from "./DesignLibraryDetail";
import { BrowserPreviewPanel } from "./BrowserPreviewPanel";
import { ServiceHealthBar } from "./ServiceHealthBar";
import { validateEntry, archiveEntry, deleteEntry, createExtractionJob, cancelExtractionJob } from "./api";
import { groupEntriesBySourceUrl } from "./grouping";
import {
  JOB_STATUS_COLORS,
  DEFAULT_FILTERS,
  type LibraryEntry,
  type LibraryFilters,
  type ViewMode,
} from "./types";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";

interface UserMetrics {
  jobCount: number;
  entryCount: number;
  avgQuality: number;
  validatedCount: number;
  recentJobs: Array<{
    id: string;
    status: string;
    categories: string[] | null;
    created_at: string;
    finished_at: string | null;
    error: string | null;
  }>;
}

const EMPTY_METRICS: UserMetrics = {
  jobCount: 0,
  entryCount: 0,
  avgQuality: 0,
  validatedCount: 0,
  recentJobs: [],
};

export function DesignLibraryPage() {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedEntry, setSelectedEntry] = useState<LibraryEntry | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showJobs, setShowJobs] = useState(true);
  const [metrics, setMetrics] = useState<UserMetrics>(EMPTY_METRICS);

  const {
    entries,
    overview,
    loading: entriesLoading,
    refreshing: entriesRefreshing,
    reload: reloadEntries,
  } = useLibrary(filters);
  const { jobs, loading: jobsLoading, reload: reloadJobs } = useJobs();
  const sourceClusters = useMemo(() => groupEntriesBySourceUrl(entries), [entries]);
  const groupedMode = filters.ingestKind === "all";
  const renderedGroups = groupedMode ? sourceClusters : null;
  const relatedEntries = useMemo(
    () => (selectedEntry ? entries.filter((entry) => entry.source_url === selectedEntry.source_url) : []),
    [entries, selectedEntry],
  );

  // Load user metrics (was UserMetricsBar — now inline)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("design_library_user_metrics");
        if (!cancelled && !error && data) {
          setMetrics(data as unknown as UserMetrics);
        }
      } catch (err) {
        console.warn("[DesignLibraryPage] failed to load user metrics:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleValidate = async (entry: LibraryEntry) => {
    try {
      await validateEntry(entry.id, !entry.validated);
      toast.success(entry.validated ? "Removida validação" : "Validada ✓");
      reloadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao validar");
    }
  };

  const handleArchive = async (entry: LibraryEntry) => {
    try {
      await archiveEntry(entry.id, !entry.is_archived);
      toast.success(entry.is_archived ? "Desarquivada" : "Arquivada");
      reloadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao arquivar");
    }
  };

  const handleDelete = async (entry: LibraryEntry) => {
    if (!confirm(`Excluir "${entry.name}"?`)) return;
    try {
      await deleteEntry(entry.id);
      toast.success("Excluída");
      reloadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const handleCreateJob = async (urls: string[], depth: string) => {
    try {
      const { jobId } = await createExtractionJob(urls, depth, [
        "hero",
        "motion",
        "typography",
        "color_application",
        "components",
        "interactions",
      ]);
      toast.success(`Job criado: ${jobId.slice(0, 8)}`);
      setCreateOpen(false);
      setActiveJobId(jobId);
      reloadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar job");
    }
  };

  const activeJobs = jobs.filter((j) => j.status === "running" || j.status === "pending");
  const recentJobs = jobs.slice(0, 5);
  const hasSmoke = (overview?.smoke_rows ?? 0) > 0;
  const hasDuplicates = (overview?.duplicate_groups ?? 0) > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Page header (sem faixa preta) */}
      <div className="px-6 pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold flex items-center gap-2">
            <Library className="size-5 text-primary" />
            Design Library
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Biblioteca curada de referências de design extraídas automaticamente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ServiceHealthBar />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="h-7"
          >
            {viewMode === "grid" ? <List className="size-3" /> : <LayoutGrid className="size-3" />}
          </Button>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="h-7">
            <Plus className="size-3 mr-1" />
            Extrair URLs
          </Button>
        </div>
      </div>

      {overview && (
        <div className="px-6 pt-3">
          <div className="rounded-lg border border-border bg-surface-1 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="outline">Total {overview.total_rows}</Badge>
              <Badge variant="outline">Produção {overview.production_rows}</Badge>
              <Badge variant="outline">Curado {overview.curated_rows}</Badge>
              <Badge variant="outline">Smoke {overview.smoke_rows}</Badge>
              <Badge variant="outline">Manual {overview.manual_rows}</Badge>
              <Badge variant="outline">URLs únicas {overview.distinct_source_urls}</Badge>
              <Badge variant="outline">Duplicadas {overview.duplicate_groups}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 text-blue-500">
                <Briefcase className="size-3" />
                <span className="font-semibold tabular-nums">{metrics.jobCount}</span>
                <span className="text-muted-foreground">Jobs</span>
              </span>
              <span className="inline-flex items-center gap-1 text-green-500">
                <FolderOpen className="size-3" />
                <span className="font-semibold tabular-nums">{metrics.entryCount}</span>
                <span className="text-muted-foreground">Entradas</span>
              </span>
              <span className="inline-flex items-center gap-1 text-amber-500">
                <Star className="size-3" />
                <span className="font-semibold tabular-nums">{metrics.avgQuality > 0 ? metrics.avgQuality.toFixed(1) : "—"}</span>
                <span className="text-muted-foreground">Qualidade</span>
              </span>
              <span className="inline-flex items-center gap-1 text-purple-500">
                <CheckCircle className="size-3" />
                <span className="font-semibold tabular-nums">{metrics.validatedCount}</span>
                <span className="text-muted-foreground">Validadas</span>
              </span>
              {metrics.recentJobs.length > 0 && (
                <>
                  <span className="text-border ml-1">│</span>
                  <TrendingUp className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Últimos:</span>
                  {metrics.recentJobs.slice(0, 3).map((j) => (
                    <Badge
                      key={j.id}
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${
                        j.status === "completed"
                          ? "border-green-500/30 text-green-500"
                          : j.status === "failed"
                            ? "border-red-500/30 text-red-500"
                            : j.status === "running"
                              ? "border-yellow-500/30 text-yellow-500 animate-pulse"
                              : "border-border text-muted-foreground"
                      }`}
                    >
                      {j.status}
                    </Badge>
                  ))}
                </>
              )}
            </div>
            {(hasSmoke || hasDuplicates) && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {hasSmoke && (
                  <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-400">
                    Há {overview.smoke_rows} entrada(s) smoke. O filtro padrão mantém a library limpa.
                  </span>
                )}
                {hasDuplicates && (
                  <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-400">
                    Existem {overview.duplicate_groups} grupo(s) com URLs repetidas. A visualização em todas as origens agrupa por URL.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extração Bar — consolida jobs ativos + recentes num bloco só */}
      {jobs.length > 0 && (
        <div className="px-6 pt-3">
          <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
            <button
              onClick={() => setShowJobs(!showJobs)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-2/50 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                <History className="size-3.5 text-muted-foreground" />
                Extrações
                {activeJobs.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-blue-500">
                    <Loader2 className="size-2.5 animate-spin" />
                    {activeJobs.length} em andamento
                  </span>
                )}
                {jobsLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </div>
              {showJobs ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
            </button>

            {showJobs && (
              <div className="px-3 pb-3 space-y-2">
                {/* Active jobs inline */}
                {activeJobs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 py-1.5 px-2 rounded bg-blue-500/5">
                    {activeJobs.map((j) => (
                      <div key={j.id} className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveJobId(j.id)}
                          className="h-6 text-[10px] border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                        >
                          <Play className="size-2.5 mr-1" />
                          {j.urls[0]?.slice(0, 25)}…
                          <ChevronRight className="size-2.5 ml-1" />
                        </Button>
                        <button
                          onClick={async () => {
                            try {
                              await cancelExtractionJob(j.id);
                              toast.success("Extração cancelada");
                              reloadJobs();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
                            }
                          }}
                          className="h-6 px-1.5 rounded text-[10px] border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Cancelar extração"
                        >
                          <StopCircle className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent jobs list */}
                {recentJobs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1">
                    Nenhum job ainda. Clique em &quot;Extrair URLs&quot; para começar.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {recentJobs.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => setActiveJobId(job.id)}
                        className="text-left text-[10px] px-2 py-1 rounded border border-border bg-surface-2 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1 py-0 ${JOB_STATUS_COLORS[job.status] ?? ""}`}
                          >
                            {job.status}
                          </Badge>
                          <span className="font-mono text-muted-foreground">{job.id.slice(0, 8)}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5 truncate max-w-[200px]">
                          {job.urls[0] ?? "—"}
                          {job.urls.length > 1 && ` +${job.urls.length - 1}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Filters */}
        <DesignLibraryFilters
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />

        {/* Entries Grid/List */}
        {entriesLoading ? (
          <div className="text-center py-8 text-xs text-muted-foreground">Carregando entradas…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <Library className="size-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium mb-1">Nenhuma entrada encontrada</h3>
            <p className="text-xs text-muted-foreground">
              {hasSmoke && filters.ingestKind === "production"
                ? "Há entradas smoke/test na biblioteca. Troque a origem para revisar esses dados."
                : "Clique em \"Extrair URLs\" para começar a popular a biblioteca"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <>
            {entriesRefreshing && (
              <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Atualizando biblioteca…
              </div>
            )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 4xl:grid-cols-8 5xl:grid-cols-9 gap-2.5">
            {groupedMode
              ? (renderedGroups ?? []).map((cluster) => {
                  const entry = cluster.primary;
                  return (
                    <DesignLibraryCard
                      key={`${entry.id}:${cluster.sourceUrl}`}
                      entry={entry}
                      duplicateCount={cluster.count - 1}
                      variantCount={cluster.count}
                      relatedKinds={cluster.ingestKinds}
                      onView={() => setSelectedEntry(entry)}
                      onValidate={() => handleValidate(entry)}
                      onArchive={() => handleArchive(entry)}
                      onDelete={() => handleDelete(entry)}
                    />
                  );
                })
              : entries.map((entry) => (
                  <DesignLibraryCard
                    key={entry.id}
                    entry={entry}
                    onView={() => setSelectedEntry(entry)}
                    onValidate={() => handleValidate(entry)}
                    onArchive={() => handleArchive(entry)}
                    onDelete={() => handleDelete(entry)}
                  />
                ))}
          </div>
          </>
        ) : (
          <>
            {entriesRefreshing && (
              <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Atualizando biblioteca…
              </div>
            )}
          <div className="space-y-1">
            {groupedMode
              ? (renderedGroups ?? []).map((cluster) => {
                  const entry = cluster.primary;
                  return (
                    <div
                      key={`${entry.id}:${cluster.sourceUrl}`}
                      className={`flex items-center gap-3 p-2 rounded border border-border bg-surface-1 hover:border-primary/30 cursor-pointer ${cluster.hasDuplicates ? "ring-1 ring-amber-500/15" : ""}`}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <div className="w-16 h-10 rounded bg-surface-3 overflow-hidden shrink-0">
                        {(entry.screenshot_url || entry.screenshot_base64) && (
                          <img src={entry.screenshot_url || entry.screenshot_base64 || ""} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate">{entry.name}</h3>
                        <p className="text-[10px] text-muted-foreground truncate">{entry.source_url}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.category}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {entry.ingest_kind}
                      </Badge>
                      {cluster.count > 1 && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                          {cluster.count} versões
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${entry.quality_score >= 7 ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400"}`}
                      >
                        Q {entry.quality_score.toFixed(1)}
                      </Badge>
                      {entry.validated && (
                        <Badge variant="default" className="text-[10px] bg-green-500/20 text-green-400">
                          ✓
                        </Badge>
                      )}
                    </div>
                  );
                })
              : entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-2 rounded border border-border bg-surface-1 hover:border-primary/30 cursor-pointer"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="w-16 h-10 rounded bg-surface-3 overflow-hidden shrink-0">
                      {(entry.screenshot_url || entry.screenshot_base64) && (
                        <img src={entry.screenshot_url || entry.screenshot_base64 || ""} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium truncate">{entry.name}</h3>
                      <p className="text-[10px] text-muted-foreground truncate">{entry.source_url}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {entry.category}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {entry.ingest_kind}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${entry.quality_score >= 7 ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400"}`}
                    >
                      Q {entry.quality_score.toFixed(1)}
                    </Badge>
                    {entry.validated && (
                      <Badge variant="default" className="text-[10px] bg-green-500/20 text-green-400">
                        ✓
                      </Badge>
                    )}
                  </div>
                ))}
          </div>
          </>
        )}
      </div>

      {/* Detail Dialog */}
      <DesignLibraryDetail
        entry={selectedEntry}
        relatedEntries={relatedEntries}
        open={!!selectedEntry}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      />

      {/* Browser Preview Panel */}
      {activeJobId && (
        <BrowserPreviewPanel jobId={activeJobId} onClose={() => setActiveJobId(null)} />
      )}

      {/* Create Job Dialog */}
      <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreateJob} />
    </div>
  );
}

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (urls: string[], depth: string) => Promise<void>;
}

function CreateJobDialog({ open, onOpenChange, onCreate }: CreateJobDialogProps) {
  const [urlsText, setUrlsText] = useState("");
  const [depth, setDepth] = useState<"shallow" | "deep">("deep");
  const [submitting, setSubmitting] = useState(false);

  const urls = urlsText
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  const isValid = urls.length > 0 && urls.length <= 5;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(urls, depth);
      setUrlsText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extrair Design DNA</DialogTitle>
          <DialogDescription>
            Adicione até 5 URLs. A extração roda em sandbox E2B com Playwright + Chromium.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block">URLs (1-5, uma por linha)</label>
            <TextareaSimple
              value={urlsText}
              onChange={setUrlsText}
              placeholder="https://stripe.com&#10;https://linear.app&#10;https://vercel.com"
              rows={5}
            />
            {urlsText && urls.length > 5 && (
              <p className="text-[10px] text-destructive mt-1">Máximo 5 URLs</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block">Profundidade</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDepth("shallow")}
                className={`flex-1 px-3 py-2 rounded-md border text-xs ${
                  depth === "shallow"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-1"
                }`}
              >
                Shallow
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  Markdown + screenshot
                </span>
              </button>
              <button
                onClick={() => setDepth("deep")}
                className={`flex-1 px-3 py-2 rounded-md border text-xs ${
                  depth === "deep"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-1"
                }`}
              >
                Deep
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  Playwright + CSS + motion
                </span>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={submitting}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} size="sm" disabled={!isValid || submitting}>
            {submitting && <Loader2 className="size-3 mr-1 animate-spin" />}
            Iniciar extração ({urls.length} URL{urls.length !== 1 ? "s" : ""})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextareaSimple({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
    />
  );
}
