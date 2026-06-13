/**
 * GraduationGate — Pre-publish credential verification
 * Verifica secrets de operação do agente (tools) em tenant_secrets.
 * LLM providers ficam em /api — não bloquear publicação por GROQ/OPENAI/etc.
 */
import { useState, useCallback } from "react";
import { AlertTriangle, KeyRound, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Node } from "@xyflow/react";
import { findModel, findProvider } from "./model-catalog-frontend";
import { extractToolSecrets, NVIDIA_MODEL_SECRET_MAP } from "./flow-tool-secrets";

interface MissingCredential {
  nodeId: string;
  nodeLabel: string;
  secretName: string;
  context: string;
}

/** BYOK LLM secrets still stored per-agent (non-platform providers only). */
function resolveLlmSecretName(modelId: string): string | null {
  const normalized = modelId.includes("/") ? modelId : `google/${modelId}`;
  const model = findModel(normalized) ?? findModel(modelId);
  if (!model) return null;

  const provider = findProvider(model.provider);
  if (!provider || provider.id === "ollama" || provider.platformProvided) return null;

  if (provider.id === "nvidia") {
    return NVIDIA_MODEL_SECRET_MAP[model.id] || provider.secretEnvKey || "NVIDIA_API_KEY";
  }

  // google → GOOGLE_AI_API_KEY (not GOOGLE_API_KEY)
  return provider.secretEnvKey || null;
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

    const requiredSecrets = new Map<string, MissingCredential>();

    for (const secretName of extractToolSecrets(nodes)) {
      if (!requiredSecrets.has(secretName)) {
        requiredSecrets.set(secretName, {
          nodeId: "tool",
          nodeLabel: "Tool",
          secretName,
          context: "Tool do registry",
        });
      }
    }

    const llmNodes = nodes.filter((n) => n.type === "llm" || n.type === "sub_flow");
    for (const node of llmNodes) {
      const config = (node.data as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
      const modelId = String(config?.model_id || config?.modelId || config?.model || "");
      if (!modelId) continue;

      const secretName = resolveLlmSecretName(modelId);
      if (!secretName || requiredSecrets.has(secretName)) continue;

      requiredSecrets.set(secretName, {
        nodeId: node.id,
        nodeLabel: String(config?.label || node.id),
        secretName,
        context: `Modelo: ${modelId}`,
      });
    }

    if (requiredSecrets.size === 0) {
      setChecking(false);
      onProceed();
      return;
    }

    const { data: secrets } = await supabase
      .from("tenant_secrets")
      .select("secret_name")
      .eq("tenant_id", flowId);

    const existingNames = new Set((secrets || []).map((s: { secret_name: string }) => s.secret_name));

    const missingCreds: MissingCredential[] = [];
    for (const [, cred] of requiredSecrets) {
      if (!existingNames.has(cred.secretName)) {
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
                Configure os secrets de operação do agente antes de publicar
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="px-6 pb-2">
          <p className="text-[11px] mb-3" style={{ color: "var(--ps-cream-40)" }}>
            Chaves de LLM (Groq, OpenAI, Gemini…) ficam em /api. Aqui faltam secrets de tools ou BYOK:
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
                      {cred.context} · Nó: {cred.nodeLabel}
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