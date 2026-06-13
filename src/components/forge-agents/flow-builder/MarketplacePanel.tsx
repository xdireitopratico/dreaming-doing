/**
 * MarketplacePanel — Marketplace de agentes: publicar, explorar, comprar/instalar e avaliar
 * R52: Marketplace Monetizado — pricing, checkout Stripe, revenue sharing
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  X, Search, Star, Download, Upload, Package, Trash2,
  RefreshCw, ChevronDown, ChevronUp, Globe, StarOff,
  DollarSign, ShoppingCart, Gift,
} from "lucide-react";

interface Listing {
  id: string;
  flow_id: string;
  publisher_id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  category: string;
  tags: string[];
  icon_emoji: string;
  flow_snapshot: { nodes?: any[]; edges?: any[] };
  version: number;
  is_published: boolean;
  install_count: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  price_cents: number;
  revenue_share_percent: number;
  is_free: boolean;
}

const CATEGORIES = [
  { value: "all", label: "Todos" },
  { value: "atendimento", label: "Atendimento" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
  { value: "juridico", label: "Jurídico" },
  { value: "rh", label: "RH" },
  { value: "marketing", label: "Marketing" },
  { value: "general", label: "Geral" },
];

interface MarketplacePanelProps {
  flowId: string;
  currentNodes: any[];
  currentEdges: any[];
  flowName: string;
  onInstall: (nodes: any[], edges: any[]) => void;
  onClose: () => void;
}

export function MarketplacePanel({
  flowId, currentNodes, currentEdges, flowName, onInstall, onClose,
}: MarketplacePanelProps) {
  const [tab, setTab] = useState<"browse" | "publish" | "mine">("browse");
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  // Publish form
  const [pubName, setPubName] = useState(flowName);
  const [pubDesc, setPubDesc] = useState("");
  const [pubShortDesc, setPubShortDesc] = useState("");
  const [pubCategory, setPubCategory] = useState("general");
  const [pubTags, setPubTags] = useState("");
  const [pubEmoji, setPubEmoji] = useState("🤖");
  const [pubPrice, setPubPrice] = useState("");
  const [pubRevShare, setPubRevShare] = useState(80);
  const [publishing, setPublishing] = useState(false);

  // Rating
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [buyingId, setBuyingId] = useState<string | null>(null);

  ;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    let query = supabase
      .from("agent_marketplace_listings")
      .select("*")
      .eq("is_published", true)
      .order("install_count", { ascending: false });
    if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
    const { data } = await query;
    setListings((data as unknown as Listing[]) || []);
    setLoading(false);
  };

  const fetchMyListings = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("agent_marketplace_listings")
      .select("*")
      .eq("publisher_id", userId)
      .order("created_at", { ascending: false });
    setMyListings((data as unknown as Listing[]) || []);
  };

  const fetchPurchases = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("agent_marketplace_purchases")
      .select("listing_id")
      .eq("buyer_id", userId)
      .eq("status", "completed");
    setPurchasedIds(new Set((data || []).map((p: any) => p.listing_id)));
  };

  useEffect(() => { fetchListings(); }, [categoryFilter]);
  useEffect(() => { if (tab === "mine" && userId) fetchMyListings(); }, [tab, userId]);
  useEffect(() => { if (userId) fetchPurchases(); }, [userId]);

  const filtered = listings.filter((l) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q) || l.tags?.some((t) => t.toLowerCase().includes(q));
  });

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Grátis";
    return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  };

  const handlePublish = async () => {
    if (!userId) return;
    setPublishing(true);
    const priceCents = pubPrice ? Math.round(parseFloat(pubPrice.replace(",", ".")) * 100) : 0;

    const { error } = await supabase.from("agent_marketplace_listings").insert({
      flow_id: flowId,
      publisher_id: userId,
      name: pubName,
      description: pubDesc,
      short_description: pubShortDesc,
      category: pubCategory,
      tags: pubTags.split(",").map((t) => t.trim()).filter(Boolean),
      icon_emoji: pubEmoji,
      flow_snapshot: JSON.parse(JSON.stringify({ nodes: currentNodes, edges: currentEdges })),
      price_cents: priceCents,
      revenue_share_percent: pubRevShare,
    } as any);

    if (error) {
      toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Agente publicado no marketplace!" });
      setTab("mine");
      fetchMyListings();
    }
    setPublishing(false);
  };

  const handleBuy = async (listing: Listing) => {
    if (!userId) return;
    setBuyingId(listing.id);
    try {
      const { data, error } = await supabase.functions.invoke("aetherforge-marketplace-checkout", {
        body: {
          listing_id: listing.id,
          success_url: window.location.href,
          cancel_url: window.location.href,
        },
      });
      if (error || data?.error) {
        toast({ title: "Erro no checkout", description: data?.error || error?.message, variant: "destructive" });
      } else if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setBuyingId(null);
    }
  };

  const handleInstall = async (listing: Listing) => {
    const snapshot = listing.flow_snapshot;
    if (!snapshot?.nodes?.length) {
      toast({ title: "Snapshot vazio", variant: "destructive" });
      return;
    }
    const idMap: Record<string, string> = {};
    const newNodes = snapshot.nodes.map((n: any) => {
      const newId = `${n.type || "node"}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      idMap[n.id] = newId;
      return { ...n, id: newId };
    });
    const newEdges = (snapshot.edges || []).map((e: any) => ({
      ...e,
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: idMap[e.source] || e.source,
      target: idMap[e.target] || e.target,
    }));

    if (listing.is_free || listing.price_cents === 0) {
      await supabase
        .from("agent_marketplace_listings")
        .update({ install_count: (listing.install_count || 0) + 1 } as any)
        .eq("id", listing.id);
    }

    onInstall(newNodes, newEdges);
    toast({ title: `"${listing.name}" instalado!` });
  };

  const handleUnpublish = async (id: string) => {
    await supabase.from("agent_marketplace_listings").update({ is_published: false } as any).eq("id", id);
    fetchMyListings();
    toast({ title: "Listagem removida" });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("agent_marketplace_listings").delete().eq("id", id);
    setMyListings((m) => m.filter((x) => x.id !== id));
    toast({ title: "Listagem deletada" });
  };

  const handleRate = async (listingId: string) => {
    if (!userId || ratingValue < 1) return;
    const { error } = await supabase.from("agent_marketplace_ratings").upsert({
      listing_id: listingId, user_id: userId, rating: ratingValue, comment: ratingComment || null,
    } as any, { onConflict: "listing_id,user_id" });
    if (error) {
      toast({ title: "Erro ao avaliar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Avaliação enviada!" });
      setRatingValue(0);
      setRatingComment("");
      fetchListings();
    }
  };

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-3 w-3 ${s <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );

  const renderInteractiveStars = (value: number, onChange: (v: number) => void) => (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-4 w-4 cursor-pointer transition-colors ${s <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-300"}`} onClick={() => onChange(s)} />
      ))}
    </div>
  );

  const canInstall = (listing: Listing) => {
    if (listing.is_free || listing.price_cents === 0) return true;
    if (listing.publisher_id === userId) return true;
    return purchasedIds.has(listing.id);
  };

  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Marketplace</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fetchListings()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(["browse", "publish", "mine"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "browse" ? "Explorar" : t === "publish" ? "Publicar" : "Meus"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Browse Tab */}
        {tab === "browse" && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar agentes..." className="h-8 text-sm pl-8" />
            </div>
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <Badge key={c.value} variant={categoryFilter === c.value ? "default" : "outline"} className="text-[10px] cursor-pointer" onClick={() => setCategoryFilter(c.value)}>
                  {c.label}
                </Badge>
              ))}
            </div>

            {loading ? (
              <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Package className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhum agente encontrado</p>
              </div>
            ) : (
              filtered.map((l) => (
                <div key={l.id} className="border rounded-lg overflow-hidden">
                  <div className="p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                    <span className="text-2xl">{l.icon_emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-2">{l.short_description || l.description || "Sem descrição"}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1">
                          {renderStars(l.avg_rating || 0)}
                          <span className="text-[10px] text-muted-foreground">({l.rating_count})</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Download className="h-2.5 w-2.5" /> {l.install_count}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {l.price_cents > 0 ? (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <DollarSign className="h-2.5 w-2.5" />
                          {formatPrice(l.price_cents)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-300">
                          <Gift className="h-2.5 w-2.5" /> Grátis
                        </Badge>
                      )}
                      {expandedId === l.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {expandedId === l.id && (
                    <div className="border-t p-3 space-y-3 bg-muted/20">
                      {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px]">{l.category}</Badge>
                        {l.tags?.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {(l.flow_snapshot?.nodes || []).length} nós · v{l.version}
                      </div>

                      {/* Action buttons */}
                      {canInstall(l) ? (
                        <Button size="sm" className="w-full gap-2" onClick={() => handleInstall(l)}>
                          <Download className="h-3.5 w-3.5" />
                          Instalar no Canvas
                        </Button>
                      ) : (
                        <Button size="sm" className="w-full gap-2" onClick={() => handleBuy(l)} disabled={buyingId === l.id}>
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {buyingId === l.id ? "Processando..." : `Comprar — ${formatPrice(l.price_cents)}`}
                        </Button>
                      )}

                      {/* Rating */}
                      <div className="border-t pt-2 space-y-2">
                        <div className="text-[10px] font-medium text-muted-foreground uppercase">Avaliar</div>
                        <div className="flex items-center gap-3">
                          {renderInteractiveStars(ratingValue, setRatingValue)}
                          {ratingValue > 0 && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleRate(l.id)}>Enviar</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* Publish Tab */}
        {tab === "publish" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Publique o agente atual no marketplace. Defina um preço ou ofereça gratuitamente.
            </div>

            <div className="flex gap-2">
              <div className="w-16">
                <label className="text-xs text-muted-foreground mb-1 block">Emoji</label>
                <Input value={pubEmoji} onChange={(e) => setPubEmoji(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <Input value={pubName} onChange={(e) => setPubName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição curta</label>
              <Input value={pubShortDesc} onChange={(e) => setPubShortDesc(e.target.value)} className="h-8 text-sm" placeholder="Uma frase sobre o agente" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição completa</label>
              <Textarea value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} className="text-sm min-h-[80px]" placeholder="Detalhe o que o agente faz..." />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                  <Badge key={c.value} variant={pubCategory === c.value ? "default" : "outline"} className="text-[10px] cursor-pointer" onClick={() => setPubCategory(c.value)}>
                    {c.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tags (separadas por vírgula)</label>
              <Input value={pubTags} onChange={(e) => setPubTags(e.target.value)} className="h-8 text-sm" placeholder="chatbot, vendas, IA" />
            </div>

            {/* Pricing section */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Precificação</span>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Preço (R$) — deixe vazio para gratuito</label>
                <Input value={pubPrice} onChange={(e) => setPubPrice(e.target.value)} className="h-8 text-sm" placeholder="0,00" />
              </div>

              {pubPrice && parseFloat(pubPrice.replace(",", ".")) > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Revenue share: você recebe {pubRevShare}% · plataforma {100 - pubRevShare}%
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={95}
                    step={5}
                    value={pubRevShare}
                    onChange={(e) => setPubRevShare(Number(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>50%</span>
                    <span className="font-medium text-foreground">{pubRevShare}%</span>
                    <span>95%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-2 rounded bg-muted/30 text-[10px] text-muted-foreground">
              📦 Snapshot: {currentNodes.length} nós · {currentEdges.length} conexões
            </div>

            <Button className="w-full gap-2" onClick={handlePublish} disabled={publishing || !pubName.trim()}>
              <Upload className="h-4 w-4" />
              Publicar no Marketplace
            </Button>
          </div>
        )}

        {/* My Listings Tab */}
        {tab === "mine" && (
          <>
            {myListings.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Package className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhum agente publicado</p>
              </div>
            ) : (
              myListings.map((l) => (
                <div key={l.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{l.icon_emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Badge variant={l.is_published ? "default" : "secondary"} className="text-[10px]">
                          {l.is_published ? "Publicado" : "Oculto"}
                        </Badge>
                        <span>{formatPrice(l.price_cents)}</span>
                        <span>·</span>
                        <Download className="h-2.5 w-2.5 inline" /> {l.install_count}
                        <span>·</span>
                        {renderStars(l.avg_rating || 0)}
                        <span>({l.rating_count})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {l.is_published && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => handleUnpublish(l.id)}>
                        <StarOff className="h-3 w-3" /> Despublicar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
