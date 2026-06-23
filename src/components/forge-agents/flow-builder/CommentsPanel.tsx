/**
 * CommentsPanel — Comentários inline nos nós do flow com threads e @menções
 * Rodada 26: Agent Collaboration + Comments
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  MessageSquare,
  Send,
  Reply,
  CheckCircle2,
  CornerDownRight,
  AtSign,
  Trash2,
  Filter,
} from "lucide-react";
import type { Node } from "@/types/xyflow-react-shim";

interface Comment {
  id: string;
  flow_id: string;
  node_id: string | null;
  parent_id: string | null;
  user_id: string;
  content: string;
  mentions: string[];
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface CommentsPanelProps {
  flowId: string;
  nodes: Node[];
  onHighlightNode: (nodeId: string | null) => void;
  onCommentCountChange?: (counts: Record<string, number>) => void;
  onClose: () => void;
}

export function CommentsPanel({ flowId, nodes, onHighlightNode, onCommentCountChange, onClose }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [newComment, setNewComment] = useState("");
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("all");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load comments
  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from("agent_flow_comments")
      .select("*")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: true });

    if (data) {
      setComments(data as Comment[]);
      // Build comment count per node
      const counts: Record<string, number> = {};
      (data as Comment[]).forEach((c) => {
        if (c.node_id && !c.parent_id) {
          counts[c.node_id] = (counts[c.node_id] || 0) + 1;
        }
      });
      onCommentCountChange?.(counts);
    }
  }, [flowId, onCommentCountChange]);

  // Load team members for @mentions
  const loadMembers = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from("agent_flow_members")
      .select("user_id")
      .eq("flow_id", flowId);

    const { data: flowData } = await supabase
      .from("agent_flows")
      .select("user_id")
      .eq("id", flowId)
      .single();

    const userIds = new Set<string>();
    if (flowData) userIds.add((flowData as any).user_id);
    memberRows?.forEach((m: any) => userIds.add(m.user_id));

    if (userIds.size > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(userIds));

      if (profileData) {
        const profs: Record<string, { full_name: string | null; email: string | null }> = {};
        const mems: TeamMember[] = [];
        (profileData as any[]).forEach((p) => {
          profs[p.id] = { full_name: p.full_name, email: p.email };
          mems.push({ id: p.id, full_name: p.full_name, email: p.email });
        });
        setProfiles(profs);
        setMembers(mems);
      }
    }
  }, [flowId]);

  useEffect(() => {
    loadComments();
    loadMembers();
  }, [loadComments, loadMembers]);

  // Polling every 1 min (no Realtime)
  useEffect(() => {
    const interval = setInterval(loadComments, 60_000);
    return () => clearInterval(interval);
  }, [flowId, loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    // Extract @mentions
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentionIds: string[] = [];
    let match;
    while ((match = mentionRegex.exec(newComment)) !== null) {
      mentionIds.push(match[2]);
    }

    await supabase.from("agent_flow_comments").insert({
      flow_id: flowId,
      node_id: selectedNodeFilter || null,
      parent_id: replyTo || null,
      user_id: userData.user.id,
      content: newComment.trim(),
      mentions: mentionIds,
    });

    setNewComment("");
    setReplyTo(null);
    setShowMentions(false);
  };

  const handleResolve = async (commentId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("agent_flow_comments").update({
      is_resolved: true,
      resolved_by: userData?.user?.id || null,
      resolved_at: new Date().toISOString(),
    }).eq("id", commentId);
  };

  const handleDelete = async (commentId: string) => {
    await supabase.from("agent_flow_comments").delete().eq("id", commentId);
  };

  const insertMention = (member: TeamMember) => {
    const mention = `@[${member.full_name || member.email || "user"}](${member.id}) `;
    setNewComment((prev) => prev.replace(/@\w*$/, "") + mention);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleTextChange = (value: string) => {
    setNewComment(value);
    const lastWord = value.split(/\s/).pop() || "";
    if (lastWord.startsWith("@") && lastWord.length > 1) {
      setMentionSearch(lastWord.slice(1).toLowerCase());
      setShowMentions(true);
    } else if (lastWord === "@") {
      setMentionSearch("");
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const formatContent = (content: string) => {
    return content.replace(/@\[([^\]]+)\]\([^)]+\)/g, (_, name) => `@${name}`);
  };

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  // Filter & group
  const rootComments = comments.filter((c) => !c.parent_id);
  const filteredComments = rootComments.filter((c) => {
    if (selectedNodeFilter && c.node_id !== selectedNodeFilter) return false;
    if (filterResolved === "open" && c.is_resolved) return false;
    if (filterResolved === "resolved" && !c.is_resolved) return false;
    return true;
  });

  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  const nodesWithComments = nodes.filter((n) =>
    comments.some((c) => c.node_id === n.id && !c.parent_id)
  );

  const filteredMembers = members.filter((m) =>
    (m.full_name || m.email || "").toLowerCase().includes(mentionSearch)
  );

  return (
    <div className="w-[400px] border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Comentários</span>
          <Badge variant="secondary" className="text-[10px]">
            {rootComments.filter((c) => !c.is_resolved).length} abertos
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="p-2 border-b space-y-2">
        <div className="flex gap-1">
          {(["all", "open", "resolved"] as const).map((f) => (
            <Button
              key={f}
              variant={filterResolved === f ? "default" : "ghost"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setFilterResolved(f)}
            >
              {f === "all" ? "Todos" : f === "open" ? "Abertos" : "Resolvidos"}
            </Button>
          ))}
        </div>

        {/* Node filter */}
        <div className="flex gap-1 flex-wrap">
          <Button
            variant={!selectedNodeFilter ? "default" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => setSelectedNodeFilter(null)}
          >
            <Filter className="h-3 w-3 mr-1" />
            Todos
          </Button>
          {nodesWithComments.map((n) => (
            <Button
              key={n.id}
              variant={selectedNodeFilter === n.id ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                setSelectedNodeFilter(n.id);
                onHighlightNode(n.id);
              }}
            >
              {(n.data as any)?.label || n.type}
            </Button>
          ))}
        </div>
      </div>

      {/* Comments List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {filteredComments.length === 0 && (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">Nenhum comentário ainda</p>
              <p className="text-[10px] text-muted-foreground mt-1">Use @ para mencionar membros da equipe</p>
            </div>
          )}

          {filteredComments.map((comment) => {
            const replies = getReplies(comment.id);
            const author = profiles[comment.user_id];
            return (
              <div
                key={comment.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  comment.is_resolved ? "opacity-60 bg-muted/30" : "bg-card"
                }`}
                onMouseEnter={() => comment.node_id && onHighlightNode(comment.node_id)}
                onMouseLeave={() => onHighlightNode(null)}
              >
                {/* Comment header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {(author?.full_name || author?.email || "?")[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-medium">
                      {author?.full_name || author?.email || "Usuário"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(comment.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {comment.node_id && (
                      <Badge variant="outline" className="text-[9px] h-4">
                        {nodes.find((n) => n.id === comment.node_id)?.type || "nó"}
                      </Badge>
                    )}
                    {!comment.is_resolved && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleResolve(comment.id)}
                        title="Resolver"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleDelete(comment.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Content */}
                <p className="text-xs leading-relaxed whitespace-pre-wrap">
                  {formatContent(comment.content).split(/(@\w+)/g).map((part, i) =>
                    part.startsWith("@") ? (
                      <span key={i} className="text-primary font-medium">{part}</span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>

                {comment.is_resolved && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Resolvido {comment.resolved_at ? relativeTime(comment.resolved_at) : ""}</span>
                  </div>
                )}

                {/* Replies */}
                {replies.length > 0 && (
                  <div className="ml-4 space-y-2 border-l-2 border-muted pl-3">
                    {replies.map((reply) => {
                      const replyAuthor = profiles[reply.user_id];
                      return (
                        <div key={reply.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold">
                              {(replyAuthor?.full_name || replyAuthor?.email || "?")[0].toUpperCase()}
                            </div>
                            <span className="text-[10px] font-medium">
                              {replyAuthor?.full_name || replyAuthor?.email || "Usuário"}
                            </span>
                            <span className="text-[9px] text-muted-foreground">{relativeTime(reply.created_at)}</span>
                            <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => handleDelete(reply.id)}>
                              <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
                            </Button>
                          </div>
                          <p className="text-[11px] leading-relaxed whitespace-pre-wrap">
                            {formatContent(reply.content).split(/(@\w+)/g).map((part, i) =>
                              part.startsWith("@") ? (
                                <span key={i} className="text-primary font-medium">{part}</span>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply button */}
                {!comment.is_resolved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] gap-1 px-1"
                    onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  >
                    <Reply className="h-3 w-3" />
                    Responder
                  </Button>
                )}

                {/* Reply input */}
                {replyTo === comment.id && (
                  <div className="flex gap-2 mt-1">
                    <CornerDownRight className="h-3 w-3 text-muted-foreground mt-2 shrink-0" />
                    <div className="flex-1 relative">
                      <Textarea
                        ref={textareaRef}
                        value={newComment}
                        onChange={(e) => handleTextChange(e.target.value)}
                        placeholder="Responder... Use @ para mencionar"
                        className="min-h-[60px] text-xs resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                        }}
                      />
                      {showMentions && filteredMembers.length > 0 && (
                        <div className="absolute bottom-full left-0 w-full bg-popover border rounded-md shadow-md mb-1 max-h-32 overflow-auto z-50">
                          {filteredMembers.map((m) => (
                            <button
                              key={m.id}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
                              onClick={() => insertMention(m)}
                            >
                              <AtSign className="h-3 w-3 text-primary" />
                              {m.full_name || m.email}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSubmit}>
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* New comment input (root) */}
      {!replyTo && (
        <div className="p-3 border-t space-y-2">
          {selectedNodeFilter && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              Comentando em: <Badge variant="outline" className="text-[9px] h-4">{nodes.find((n) => n.id === selectedNodeFilter)?.type}</Badge>
            </div>
          )}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Novo comentário... Use @ para mencionar"
              className="min-h-[60px] text-xs resize-none pr-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
              }}
            />
            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute bottom-full left-0 w-full bg-popover border rounded-md shadow-md mb-1 max-h-32 overflow-auto z-50">
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
                    onClick={() => insertMention(m)}
                  >
                    <AtSign className="h-3 w-3 text-primary" />
                    {m.full_name || m.email}
                  </button>
                ))}
              </div>
            )}
            <Button
              size="icon"
              className="h-8 w-8 absolute bottom-2 right-2"
              onClick={handleSubmit}
              disabled={!newComment.trim()}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
