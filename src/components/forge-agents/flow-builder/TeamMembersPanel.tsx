/**
 * TeamMembersPanel — Gestão de membros e permissões por agente
 * Convite por email, papéis (owner/editor/viewer), remoção
 */
import { useState, useEffect, useCallback } from "react";
import {
  X,
  Users,
  UserPlus,
  RefreshCw,
  Trash2,
  Crown,
  Pencil,
  Eye,
  Mail,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";

interface FlowMember {
  id: string;
  flow_id: string;
  user_id: string;
  role: string;
  invited_by: string | null;
  invited_email: string | null;
  accepted_at: string | null;
  created_at: string;
}

interface TeamMembersPanelProps {
  flowId: string;
  onClose: () => void;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  owner: { label: "Owner", icon: <Crown className="h-3 w-3" />, color: "bg-amber-500/10 text-amber-600 border-amber-500/20", desc: "Controle total" },
  editor: { label: "Editor", icon: <Pencil className="h-3 w-3" />, color: "bg-primary/10 text-primary border-primary/20", desc: "Editar e testar" },
  viewer: { label: "Viewer", icon: <Eye className="h-3 w-3" />, color: "bg-muted text-muted-foreground border-border", desc: "Apenas visualizar" },
};

export function TeamMembersPanel({ flowId, onClose }: TeamMembersPanelProps) {
  const [members, setMembers] = useState<FlowMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState<string | null>(null);
  ;

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const [membersRes, userRes] = await Promise.all([
      supabase
        .from("agent_flow_members")
        .select("*")
        .eq("flow_id", flowId)
        .order("created_at", { ascending: true }),
      supabase.auth.getUser(),
    ]);

    if (membersRes.data) setMembers(membersRes.data as unknown as FlowMember[]);
    
    const uid = userRes.data?.user?.id;
    setCurrentUserId(uid || null);

    // Check if current user is the flow owner
    if (uid) {
      const { data: flowData } = await supabase
        .from("agent_flows")
        .select("user_id")
        .eq("id", flowId)
        .single();
      setIsOwner((flowData as any)?.user_id === uid);
    }

    setLoading(false);
  }, [flowId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);

    // Look up user by email in profiles
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail.trim().toLowerCase())
      .single();

    const userId = (profileData as any)?.id;

    if (!userId) {
      // Create a pending invite (user_id placeholder, will be resolved on accept)
      const { error } = await supabase.from("agent_flow_members").insert({
        flow_id: flowId,
        user_id: "00000000-0000-0000-0000-000000000000", // placeholder for pending
        role: inviteRole,
        invited_by: currentUserId,
        invited_email: inviteEmail.trim().toLowerCase(),
      });

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Membro já convidado", variant: "destructive" });
        } else {
          toast({ title: "Erro ao convidar", description: error.message, variant: "destructive" });
        }
      } else {
        toast({ title: `Convite enviado para ${inviteEmail}` });
        setInviteEmail("");
        fetchMembers();
      }
    } else {
      // Direct add
      const { error } = await supabase.from("agent_flow_members").insert({
        flow_id: flowId,
        user_id: userId,
        role: inviteRole,
        invited_by: currentUserId,
        invited_email: inviteEmail.trim().toLowerCase(),
        accepted_at: new Date().toISOString(),
      });

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Membro já adicionado", variant: "destructive" });
        } else {
          toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
        }
      } else {
        toast({ title: `${inviteEmail} adicionado como ${inviteRole}` });
        setInviteEmail("");
        fetchMembers();
      }
    }
    setSending(false);
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from("agent_flow_members")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Erro ao alterar papel", variant: "destructive" });
    } else {
      toast({ title: `Papel alterado para ${newRole}` });
      fetchMembers();
    }
    setShowRoleMenu(null);
  };

  const handleRemove = async (memberId: string, email: string | null) => {
    const { error } = await supabase.from("agent_flow_members").delete().eq("id", memberId);
    if (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
    } else {
      toast({ title: `${email || "Membro"} removido` });
      fetchMembers();
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  return (
    <div className="w-80 border-l bg-background flex flex-col shrink-0 max-h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Equipe
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchMembers} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Invite section */}
          {isOwner && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <h4 className="text-xs font-semibold flex items-center gap-1">
                <UserPlus className="h-3.5 w-3.5" />
                Convidar membro
              </h4>
              <Input
                placeholder="Email do membro"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex gap-1">
                {(["viewer", "editor"] as const).map((r) => (
                  <Badge
                    key={r}
                    variant={inviteRole === r ? "default" : "outline"}
                    className="cursor-pointer text-[10px] px-1.5 py-0.5"
                    onClick={() => setInviteRole(r)}
                  >
                    {ROLE_CONFIG[r].label}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full text-xs h-7 gap-1"
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || sending}
              >
                <Mail className="h-3 w-3" />
                {sending ? "Enviando..." : "Convidar"}
              </Button>
            </div>
          )}

          {/* Role legend */}
          <div className="space-y-1">
            {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-2 text-[10px]">
                <Badge variant="outline" className={`${cfg.color} text-[9px] px-1.5 gap-0.5`}>
                  {cfg.icon}
                  {cfg.label}
                </Badge>
                <span className="text-muted-foreground">{cfg.desc}</span>
              </div>
            ))}
          </div>

          {/* Owner (flow creator) */}
          <div className="border rounded-lg p-2.5 bg-amber-500/5 border-amber-500/20">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20 gap-0.5">
                <Crown className="h-2.5 w-2.5" />
                Owner
              </Badge>
              <span className="text-xs text-muted-foreground">Criador do agente</span>
            </div>
          </div>

          {/* Members list */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground">
              Membros ({members.length})
            </h4>

            {loading && members.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground">Carregando...</div>
            )}
            {!loading && members.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Nenhum membro adicionado
              </div>
            )}

            {members.map((m) => {
              const cfg = ROLE_CONFIG[m.role] || ROLE_CONFIG.viewer;
              const isPending = !m.accepted_at;

              return (
                <div key={m.id} className="border rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium truncate">
                        {m.invited_email || m.user_id.slice(0, 8) + "..."}
                      </span>
                      {isPending && (
                        <Badge variant="outline" className="text-[8px] px-1 text-amber-500 border-amber-500/30">
                          pendente
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {/* Role selector */}
                      {isOwner && (
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[9px] px-1.5 gap-0.5"
                            onClick={() => setShowRoleMenu(showRoleMenu === m.id ? null : m.id)}
                          >
                            <Badge variant="outline" className={`${cfg.color} text-[8px] px-1 gap-0.5`}>
                              {cfg.icon}
                              {cfg.label}
                            </Badge>
                            <ChevronDown className="h-2.5 w-2.5" />
                          </Button>
                          {showRoleMenu === m.id && (
                            <div className="absolute right-0 top-7 z-50 bg-background border rounded-md shadow-lg p-1 min-w-[100px]">
                              {["viewer", "editor"].map((r) => (
                                <button
                                  key={r}
                                  className="w-full text-left text-[10px] px-2 py-1.5 rounded hover:bg-muted flex items-center gap-1.5"
                                  onClick={() => handleChangeRole(m.id, r)}
                                >
                                  {ROLE_CONFIG[r].icon}
                                  {ROLE_CONFIG[r].label}
                                  {m.role === r && <Check className="h-2.5 w-2.5 ml-auto" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Remove */}
                      {(isOwner || m.user_id === currentUserId) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleRemove(m.id, m.invited_email)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Adicionado em {formatDate(m.created_at)}
                    {m.accepted_at && ` · Aceito em ${formatDate(m.accepted_at)}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info box */}
          <div className="border rounded-lg p-3 bg-muted/20 space-y-1">
            <h4 className="text-xs font-semibold">Permissões</h4>
            <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc list-inside">
              <li><strong>Owner</strong>: Editar, deletar, publicar, gerenciar membros</li>
              <li><strong>Editor</strong>: Editar flow, testar, salvar</li>
              <li><strong>Viewer</strong>: Visualizar flow e analytics</li>
            </ul>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
