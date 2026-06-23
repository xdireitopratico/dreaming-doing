/**
 * FlowPanelRenderer — Lazy-loaded side panels
 * Extraído de FlowBuilderDialog (Rodada auditoria)
 */
import { lazy, Suspense, memo } from "react";
import { Loader2 } from "lucide-react";
import type { Node, Edge } from "@/types/xyflow-react-shim";
import type { PanelType } from "./flow-builder-types";

// Lazy-loaded panels
const TestPanel = lazy(() => import("./TestPanel").then(m => ({ default: m.TestPanel })));
const DeployPanel = lazy(() => import("./DeployPanel").then(m => ({ default: m.DeployPanel })));
const ExecutionLogPanel = lazy(() => import("./ExecutionLogPanel").then(m => ({ default: m.ExecutionLogPanel })));
const EvalPanel = lazy(() => import("./EvalPanel").then(m => ({ default: m.EvalPanel })));
const ToolRegistryPanel = lazy(() => import("./ToolRegistryPanel").then(m => ({ default: m.ToolRegistryPanel })));
const ValidationPanel = lazy(() => import("./ValidationPanel").then(m => ({ default: m.ValidationPanel })));
const RAGPipelinePanel = lazy(() => import("./RAGPipelinePanel").then(m => ({ default: m.RAGPipelinePanel })));
const TemplateGalleryPanel = lazy(() => import("./TemplateGalleryPanel").then(m => ({ default: m.TemplateGalleryPanel })));
const WebhookInboxPanel = lazy(() => import("./WebhookInboxPanel").then(m => ({ default: m.WebhookInboxPanel })));
const VersionHistoryPanel = lazy(() => import("./VersionHistoryPanel").then(m => ({ default: m.VersionHistoryPanel })));
const AgentAnalyticsPanel = lazy(() => import("./AgentAnalyticsPanel").then(m => ({ default: m.AgentAnalyticsPanel })));
const TeamMembersPanel = lazy(() => import("./TeamMembersPanel").then(m => ({ default: m.TeamMembersPanel })));
const SchedulesPanel = lazy(() => import("./SchedulesPanel").then(m => ({ default: m.SchedulesPanel })));
const MarketplacePanel = lazy(() => import("./MarketplacePanel").then(m => ({ default: m.MarketplacePanel })));
const SecretsPanel = lazy(() => import("./SecretsPanel").then(m => ({ default: m.SecretsPanel })));
const NotificationsPanel = lazy(() => import("./NotificationsPanel").then(m => ({ default: m.NotificationsPanel })));
const DebugPanel = lazy(() => import("./DebugPanel").then(m => ({ default: m.DebugPanel })));
const CommentsPanel = lazy(() => import("./CommentsPanel").then(m => ({ default: m.CommentsPanel })));
const ExportImportPanel = lazy(() => import("./ExportImportPanel").then(m => ({ default: m.ExportImportPanel })));
const AgentLanguageConfig = lazy(() => import("./AgentLanguageConfig").then(m => ({ default: m.AgentLanguageConfig })));
const HITLReviewerPanel = lazy(() => import("./HITLReviewerPanel").then(m => ({ default: m.HITLReviewerPanel })));
const DLQManagementPanel = lazy(() => import("./DLQManagementPanel").then(m => ({ default: m.DLQManagementPanel })));
const PrivacyPanel = lazy(() => import("./PrivacyPanel").then(m => ({ default: m.PrivacyPanel })));
const ApiDocsPanel = lazy(() => import("./ApiDocsPanel").then(m => ({ default: m.ApiDocsPanel })));
const PhysicianPanel = lazy(() => import("./PhysicianPanel").then(m => ({ default: m.PhysicianPanel })));
const CodexPanel = lazy(() => import("./CodexPanel").then(m => ({ default: m.CodexPanel })));
const OpenApiImportPanel = lazy(() => import("./OpenApiImportPanel").then(m => ({ default: m.OpenApiImportPanel })));

function PanelLoader() {
  return (
    <div className="w-[380px] flex items-center justify-center shrink-0 h-full" style={{ background: 'var(--ps-bg)', borderLeft: '1px solid var(--ps-border)' }}>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--ps-accent)' }} />
    </div>
  );
}

interface FlowPanelRendererProps {
  activePanel: PanelType;
  flowId: string;
  flowName: string;
  nodes: Node[];
  edges: Edge[];
  onHighlightNode: (id: string | null) => void;
  onClose: () => void;
  onApplyTemplate: (nodes: Node[], edges: Edge[]) => void;
  onRollback: (nodes: Node[], edges: Edge[]) => void;
  onUnreadChange: (count: number) => void;
  onCommentCountChange: (counts: Record<string, number>) => void;
  // Language config
  agentPrimaryLang: "pt-BR" | "en" | "es";
  agentSupportedLangs: ("pt-BR" | "en" | "es")[];
  agentAutoDetect: boolean;
  onPrimaryLangChange: (lang: "pt-BR" | "en" | "es") => void;
  onSupportedLangsChange: (langs: ("pt-BR" | "en" | "es")[]) => void;
  onAutoDetectChange: (val: boolean) => void;
}

export const FlowPanelRenderer = memo(function FlowPanelRenderer({
  activePanel, flowId, flowName, nodes, edges,
  onHighlightNode, onClose, onApplyTemplate, onRollback,
  onUnreadChange, onCommentCountChange,
  agentPrimaryLang, agentSupportedLangs, agentAutoDetect,
  onPrimaryLangChange, onSupportedLangsChange, onAutoDetectChange,
}: FlowPanelRendererProps) {
  if (!activePanel) return null;

  return (
    <Suspense fallback={<PanelLoader />}>
      {activePanel === "validation" && <ValidationPanel nodes={nodes} edges={edges} onHighlightNode={onHighlightNode} onClose={onClose} />}
      {activePanel === "test" && <TestPanel nodes={nodes} edges={edges} flowId={flowId} onHighlightNode={onHighlightNode} onClose={onClose} />}
      {activePanel === "logs" && <ExecutionLogPanel flowId={flowId} nodes={nodes} onHighlightNode={onHighlightNode} onClose={onClose} />}
      {activePanel === "eval" && <EvalPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "deploy" && <DeployPanel flowId={flowId} flowName={flowName} onClose={onClose} />}
      {activePanel === "tools" && <ToolRegistryPanel onClose={onClose} />}
      {activePanel === "rag" && <RAGPipelinePanel flowId={flowId} onClose={onClose} />}
      {activePanel === "templates" && <TemplateGalleryPanel flowId={flowId} onApplyTemplate={onApplyTemplate} onClose={onClose} />}
      {activePanel === "hooks" && <WebhookInboxPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "versions" && <VersionHistoryPanel flowId={flowId} currentNodes={nodes} currentEdges={edges} onRollback={onRollback} onClose={onClose} />}
      {activePanel === "analytics" && <AgentAnalyticsPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "team" && <TeamMembersPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "schedules" && <SchedulesPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "market" && <MarketplacePanel flowId={flowId} currentNodes={nodes} currentEdges={edges} flowName={flowName} onInstall={onApplyTemplate} onClose={onClose} />}
      {activePanel === "secrets" && <SecretsPanel flowId={flowId} nodes={nodes} onClose={onClose} />}
      {activePanel === "notifications" && <NotificationsPanel flowId={flowId} onUnreadChange={onUnreadChange} onClose={onClose} />}
      {activePanel === "debug" && <DebugPanel nodes={nodes} edges={edges} flowId={flowId} onHighlightNode={onHighlightNode} onClose={onClose} />}
      {activePanel === "comments" && <CommentsPanel flowId={flowId} nodes={nodes} onHighlightNode={onHighlightNode} onCommentCountChange={onCommentCountChange} onClose={onClose} />}
      {activePanel === "exportimport" && <ExportImportPanel flowId={flowId} flowName={flowName} currentNodes={nodes} currentEdges={edges} onImport={onApplyTemplate} onClose={onClose} />}
      {activePanel === "language" && (
        <AgentLanguageConfig
          primaryLanguage={agentPrimaryLang}
          supportedLanguages={agentSupportedLangs}
          autoDetect={agentAutoDetect}
          onPrimaryChange={(l) => { onPrimaryLangChange(l); }}
          onSupportedChange={onSupportedLangsChange}
          onAutoDetectChange={onAutoDetectChange}
          onClose={onClose}
        />
      )}
      {activePanel === "hitl" && <HITLReviewerPanel />}
      {activePanel === "dlq" && <DLQManagementPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "privacy" && <PrivacyPanel onClose={onClose} />}
      {activePanel === "apidocs" && <ApiDocsPanel onClose={onClose} />}
      {activePanel === "physician" && <PhysicianPanel flowId={flowId} onClose={onClose} onHighlightNode={onHighlightNode} />}
      {activePanel === "codex" && <CodexPanel flowId={flowId} onClose={onClose} />}
      {activePanel === "openapi-import" && <OpenApiImportPanel flowId={flowId} onClose={onClose} />}
    </Suspense>
  );
});
