/**
 * GraduationGate — Pre-publish credential verification
 * Checks that LLM nodes have corresponding API keys in tenant_secrets
 * P3.5: Prevents trial/construction models from leaking into production
 */
import { useState, useCallback } from "react";
import { AlertTriangle, KeyRound, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Node } from "@xyflow/react";

/** Map provider prefix → required secret name */
const PROVIDER_SECRET_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  ollama: "", // local, no key needed
};

interface MissingCredential {
  nodeId: string;
  nodeLabel: string;
  modelId: string;
  provider: string;
  secretName: string;
}

interface GraduationGateProps {
  flowId: string;
  nodes: Node[];
  onProceed: () => void;
}

export function useGraduationGate({ flowId, nodes, onProceed }: GraduationGateProps) {
  const [showGate, setShowGate] = useState(false);
  const [missing, setMissing] = useState<MissingCredential[]>([]);
  const [checking, setChecking] = useState(false);

  const checkCredentials = useCallback(async () => {
    setChecking(true);

    // 1. Find all LLM nodes with model_id
    const llmNodes = nodes.filter(
      (n) => n.type === "llm" || n.type === "sub_flow"
    );

    const requiredSecrets = new Map<string, MissingCredential>();

    for (const node of llmNodes) {
      const config = (node.data as any)?.config || {};
      const modelId: string = config.model_id || config.modelId || "";
      if (!modelId) continue;

      const provider = modelId.split("/")[0]?.toLowerCase() || "";
      const secretName = PROVIDER_SECRET_MAP[provider];

      // Skip providers that don't need keys (ollama, etc.)
      if (secretName === "" || secretName === undefined) continue;

      if (!requiredSecrets.has(secretName)) {
        requiredSecrets.set(secretName, {
          nodeId: node.id,
          nodeLabel: (node.data as any)?.label || node.id,
          modelId,
          provider,
          secretName,
        });
      }
    }

    if (requiredSecrets.size === 0) {
      // No LLM nodes or all local models — proceed directly
      setChecking(false);
      onProceed();
      return;
    }

    // 2. Check tenant_secrets for this flow
    const { data: secrets } = await supabase
      .from("tenant_secrets")
      .select("secret_name")
      .eq("tenant_id", flowId);

    const existingNames = new Set((secrets || []).map((s: any) => s.secret_name));

    const missingCreds: MissingCredential[] = [];
    for (const [secretName, cred] of requiredSecrets) {
      if (!existingNames.has(secretName)) {
        missingCreds.push(cred);
      }
    }

    setChecking(false);

    if (missingCreds.length === 0) {
      onProceed();
    } else {
      setMissing(missingCreds);
      setShowGate(true);
    }
  }, [flowId, nodes, onProceed]);

  const GateDialog = useCallback(() => (
    <AlertDialog open={showGate} onOpenChange={setShowGate}>
      <AlertDialogContent
        className="prometheus-studio max-w-[520px] border p-0 overflow-hidden"
        style={{
          background: "hsl(225 30% 7%)",
          borderColor: "var(--ps-border)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        }}
      >
        <AlertDialogHeader className="p-6 pb-2 text-left space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)" }}
            >
              <AlertTriangle className="h-5 w-5" style={{ color: "var(--ps-orange)" }} />
            </div>
            <div>
              <AlertDialogTitle style={{ color: "var(--ps-cream)" }}>
                Credenciais necessárias
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1" style={{ color: "var(--ps-cream-60)" }}>
                Configure as API keys antes de publicar
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="px-6 pb-2">
          <p className="text-[11px] mb-3" style={{ color: "var(--ps-cream-40)" }}>
            Os seguintes nós utilizam modelos que requerem chaves de API não configuradas:
          </p>

          <ScrollArea className="max-h-[240px]">
            <div className="space-y-2">
              {missing.map((cred) => (
                <div
                  key={cred.secretName + cred.nodeId}
                  className="rounded-lg p-3 flex items-start gap-3"
                  style={{
                    background: "rgba(245,158,11,0.06)",
                    border: "1px solid rgba(245,158,11,0.15)",
                  }}
                >
                  <KeyRound className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--ps-orange)" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium" style={{ color: "var(--ps-cream-80)" }}>
                      {cred.secretName}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--ps-cream-40)" }}>
                      Nó: {cred.nodeLabel} · Modelo: {cred.modelId}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <AlertDialogFooter className="border-t p-4 flex items-center justify-between" style={{ borderColor: "var(--ps-border)" }}>
          <div className="text-[10px] flex items-center gap-1" style={{ color: "var(--ps-cream-25)" }}>
            <ExternalLink className="h-3 w-3" />
            Configure em Secrets no editor
          </div>
          <div className="flex gap-2">
            <AlertDialogCancel
              className="mt-0 border"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "var(--ps-border)", color: "var(--ps-cream-80)" }}
            >
              Voltar
            </AlertDialogCancel>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ), [showGate, missing]);

  return { checkCredentials, GateDialog, checking };
}
