/**
 * VersionHistoryPanel — Versionamento semântico + diff + rollback
 * Rodada 31: Agent Versioning + Rollback (rewrite completo)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import type { Node, Edge } from "@xyflow/react";
import {
  X,
  History,
  Plus,
  RotateCcw,
  Loader2,
  GitCommitHorizontal,
  ArrowUpCircle,
  ArrowRightCircle,
  Dot,
  Rocket,
  ChevronDown,
  ChevronUp,
  Diff,
} from "lucide-react";

// BUG 128 FIX: Typed interfaces instead of `any`
interface SnapshotNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}

interface SnapshotEdge {
  id: string;
  source?: string;
  target?: string;
}

interface Version {
  id: string;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_label: string;
  snapshot_nodes: SnapshotNode[];
  snapshot_edges: SnapshotEdge[];
  snapshot_config: Record<string, unknown> | null;
  changelog: string | null;
  change_type: string;
  created_at: string;
  is_published: boolean;
  published_at: string | null;
}

interface VersionHistoryPanelProps {
  flowId: string;
  currentNodes: Node[];
  currentEdges: Edge[];
  onRollback: (nodes: Node[], edges: Edge[]) => void;
  onClose: () => void;
}

interface DiffResult {
  nodesAdded: number;
  nodesRemoved: number;
  nodesModified: number;
  edgesAdded: number;
  edgesRemoved: number;
  totalChanges: number;
}

function computeDiff(oldNodes: SnapshotNode[], oldEdges: SnapshotEdge[], newNodes: SnapshotNode[], newEdges: SnapshotEdge[]): DiffResult {
  const oldNodeIds = new Set(oldNodes.map((n) => n.id));
  const newNodeIds = new Set(newNodes.map((n) => n.id));
  const oldEdgeIds = new Set(oldEdges.map((e) => e.id));
  const newEdgeIds = new Set(newEdges.map((e) => e.id));

  const nodesAdded = newNodes.filter((n) => !oldNodeIds.has(n.id)).length;
  const nodesRemoved = oldNodes.filter((n) => !newNodeIds.has(n.id)).length;
  const nodesModified = newNodes.filter((n) => {
    if (!oldNodeIds.has(n.id)) return false;
    const old = oldNodes.find((o) => o.id === n.id);
    return JSON.stringify(old?.data) !== JSON.stringify(n.data) ||
      JSON.stringify(old?.position) !== JSON.stringify(n.position);
  }).length;

  const edgesAdded = newEdges.filter((e) => !oldEdgeIds.has(e.id)).length;
  const edgesRemoved = oldEdges.filter((e) => !newEdgeIds.has(e.id)).length;

  return {
    nodesAdded, nodesRemoved, nodesModified,
    edgesAdded, edgesRemoved,
    totalChanges: nodesAdded + nodesRemoved + nodesModified + edgesAdded + edgesRemoved,
  };
}

export function VersionHistoryPanel({
  flowId, currentNodes, currentEdges, onRollback, onClose,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changeType, setChangeType] = useState<"patch" | "minor" | "major">("patch");
  const [changelog, setChangelog] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  ;

  const loadVersions = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("agent_versions")
      .select("*")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false })
      .limit(50);
    setVersions(data || []);
    setLoading(false);
  }, [flowId]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const nextVersion = useMemo(() => {
    if (versions.length === 0) return { major: 0, minor: 1, patch: 0 };
    const latest = versions[0];
    const m = latest.version_major;
    const mi = latest.version_minor;
    const p = latest.version_patch;
    if (changeType === "major") return { major: m + 1, minor: 0, patch: 0 };
    if (changeType === "minor") return { major: m, minor: mi + 1, patch: 0 };
    return { major: m, minor: mi, patch: p + 1 };
  }, [versions, changeType]);

  const nextLabel = `${nextVersion.major}.${nextVersion.minor}.${nextVersion.patch}`;

  const handleCreateVersion = useCallback(async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("agent_versions").insert({
        flow_id: flowId,
        version_major: nextVersion.major,
        version_minor: nextVersion.minor,
        version_patch: nextVersion.patch,
        snapshot_nodes: currentNodes,
        snapshot_edges: currentEdges,
        changelog: changelog || null,
        change_type: changeType,
      });
      if (error) throw error;
      toast({ title: `Versão ${nextLabel} criada!` });
      setChangelog("");
      await loadVersions();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao criar versão", description: errMsg, variant: "destructive" });
    }
    setSaving(false);
  }, [flowId, currentNodes, currentEdges, changelog, changeType, nextVersion, nextLabel, toast, loadVersions]);

  const handleRollback = useCallback((v: Version) => {
    onRollback(v.snapshot_nodes as Node[], v.snapshot_edges as Edge[]);
    toast({ title: `Rollback para v${v.version_label}` });
  }, [onRollback, toast]);

  // BUG 129 FIX: Check error on publish
  const handlePublish = useCallback(async (v: Version) => {
    const { error } = await (supabase as any).from("agent_versions")
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq("id", v.id);
    if (error) {
      toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `v${v.version_label} publicada!` });
    loadVersions();
  }, [toast, loadVersions]);

  const handleDiff = useCallback((v: Version) => {
    if (diffTarget === v.id) {
      setDiffTarget(null);
      setDiffResult(null);
      return;
    }
    const diff = computeDiff(v.snapshot_nodes, v.snapshot_edges, currentNodes, currentEdges);
    setDiffTarget(v.id);
    setDiffResult(diff);
  }, [diffTarget, currentNodes, currentEdges]);

  const changeTypeConfig = {
    patch: { icon: Dot, color: "text-muted-foreground", label: "Patch", desc: "Correções e ajustes menores" },
    minor: { icon: ArrowRightCircle, color: "text-amber-500", label: "Minor", desc: "Novos nós, conexões ou configs" },
    major: { icon: ArrowUpCircle, color: "text-destructive", label: "Major", desc: "Mudanças estruturais significativas" },
  };

  return (
    <div className="w-[400px] border-l bg-background flex flex-col shrink-0 h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Versões</span>
          <Badge variant="secondary" className="text-[9px]">{versions.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Create new version */}
          <div className="rounded-lg border bg-card p-3 space-y-3">
            <h4 className="text-xs font-semibold flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nova versão: <span className="text-primary">{nextLabel}</span>
            </h4>

            <div className="grid grid-cols-3 gap-1.5">
              {(["patch", "minor", "major"] as const).map((ct) => {
                const cfg = changeTypeConfig[ct];
                const Icon = cfg.icon;
                return (
                  <button
                    key={ct}
                    onClick={() => setChangeType(ct)}
                    className={`rounded-md border p-2 text-center transition-all ${
                      changeType === ct
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-transparent hover:border-muted-foreground/20"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 mx-auto mb-1 ${cfg.color}`} />
                    <p className="text-[10px] font-medium">{cfg.label}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{changeTypeConfig[changeType].desc}</p>

            <Textarea
              placeholder="Descreva as mudanças (opcional)..."
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              className="text-xs min-h-[60px] resize-none"
            />

            <Button className="w-full gap-2" size="sm" onClick={handleCreateVersion} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="h-3.5 w-3.5" />}
              {saving ? "Salvando..." : `Criar v${nextLabel}`}
            </Button>
          </div>

          <Separator />

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nenhuma versão salva ainda
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v, idx) => {
                const isExpanded = expandedId === v.id;
                const isDiffing = diffTarget === v.id;
                return (
                  <div key={v.id} className="rounded-lg border bg-card overflow-hidden">
                    <button
                      className="w-full p-2.5 flex items-center gap-2 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => setExpandedId(isExpanded ? null : v.id)}
                    >
                      <GitCommitHorizontal className={`h-3.5 w-3.5 shrink-0 ${
                        v.change_type === "major" ? "text-destructive" :
                        v.change_type === "minor" ? "text-amber-500" : "text-muted-foreground"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold">v{v.version_label}</span>
                          <Badge variant="outline" className="text-[8px] px-1">{v.change_type}</Badge>
                          {v.is_published && (
                            <Badge className="text-[8px] px-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              <Rocket className="h-2.5 w-2.5 mr-0.5" />
                              Live
                            </Badge>
                          )}
                          {idx === 0 && !v.is_published && (
                            <Badge variant="secondary" className="text-[8px] px-1">Última</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {v.changelog || "Sem descrição"}
                        </p>
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {new Date(v.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t px-2.5 py-2 space-y-2 bg-muted/10">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <span className="text-muted-foreground">Nós:</span>{" "}
                            <span className="font-medium">{(v.snapshot_nodes || []).length}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Conexões:</span>{" "}
                            <span className="font-medium">{(v.snapshot_edges || []).length}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Criado:</span>{" "}
                            <span className="font-medium">
                              {new Date(v.created_at).toLocaleString("pt-BR")}
                            </span>
                          </div>
                        </div>

                        {isDiffing && diffResult && (
                          <div className="rounded-md border bg-background p-2 space-y-1">
                            <p className="text-[10px] font-medium">Diff vs. estado atual:</p>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              {diffResult.nodesAdded > 0 && <span className="text-emerald-600">+{diffResult.nodesAdded} nós</span>}
                              {diffResult.nodesRemoved > 0 && <span className="text-destructive">-{diffResult.nodesRemoved} nós</span>}
                              {diffResult.nodesModified > 0 && <span className="text-amber-600">~{diffResult.nodesModified} modificados</span>}
                              {diffResult.edgesAdded > 0 && <span className="text-emerald-600">+{diffResult.edgesAdded} conexões</span>}
                              {diffResult.edgesRemoved > 0 && <span className="text-destructive">-{diffResult.edgesRemoved} conexões</span>}
                              {diffResult.totalChanges === 0 && <span className="text-muted-foreground col-span-2">Sem diferenças</span>}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1" onClick={() => handleDiff(v)}>
                            <Diff className="h-3 w-3" />
                            {isDiffing ? "Fechar" : "Diff"}
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1" onClick={() => handleRollback(v)}>
                            <RotateCcw className="h-3 w-3" />
                            Rollback
                          </Button>
                          {!v.is_published && (
                            <Button variant="default" size="sm" className="flex-1 h-7 text-[10px] gap-1" onClick={() => handlePublish(v)}>
                              <Rocket className="h-3 w-3" />
                              Publicar
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
