/**
 * AdminAgentBuilderView — Orchestrator with useReducer state machine
 * Phases: home → boardroom → architecture_brief → building → review → builder → monitoring
 * Onboarding removido — fluxo vai direto para boardroom (T30)
 */
import { lazy, Suspense, useCallback, useEffect, useReducer, useState, useMemo, useRef } from "react";

import { PrometheusLoadingSkeleton } from "@/components/forge-prometheus/PrometheusLoadingSkeleton";
import { PrometheusHome } from "@/components/forge-prometheus/PrometheusHome";
import { PrometheusPhaseHeader } from "@/components/forge-prometheus/PrometheusPhaseHeader";
import { PrometheusPhaseTransition } from "@/components/forge-prometheus/PrometheusPhaseTransition";
import { FlowBuilderDialog } from "./flow-builder/FlowBuilderDialog";
import { useAgentFlows } from "./hooks/useAgentFlows";
import { supabase } from "@/integrations/supabase/client";
import { estimateAgentCost } from "@/components/forge-prometheus/prometheusCatalog";
import {
  prometheusReducer,
  initialPrometheusPipelineState,
  type PrometheusUIPhase,
} from "@/components/forge-prometheus/prometheusReducer";
import type { ReviewData } from "@/components/forge-prometheus/PrometheusReview";
import type { BoardroomPhase } from "@/components/forge-prometheus/PrometheusBoardroom";
import {
  migrateLegacyPrometheusStorage,
  purgeOrphanPrometheusStorageOnce,
  readPsPipelineField,
  removePsPipelineField,
  writePsPipelineField,
} from "@/lib/prometheus-pipeline-storage";
import { findProjectDraft, upsertProjectDraftFlow } from "@/lib/agent-project-draft";

const PrometheusBoardroomPage = lazy(() =>
  import("@/components/forge-prometheus/PrometheusBoardroomPage").then(m => ({ default: m.PrometheusBoardroomPage }))
);

const PrometheusArchitectureBrief = lazy(() =>
  import("@/components/forge-prometheus/PrometheusArchitectureBrief").then(m => ({ default: m.PrometheusArchitectureBrief }))
);

const PrometheusStreamingPage = lazy(() =>
  import("@/components/forge-prometheus/PrometheusStreamingPage").then(m => ({ default: m.PrometheusStreamingPage }))
);

const PrometheusReview = lazy(() =>
  import("@/components/forge-prometheus/PrometheusReview").then(m => ({ default: m.PrometheusReview }))
);

const AgentMonitoringDashboard = lazy(() =>
  import("./monitoring/AgentMonitoringDashboard").then(m => ({ default: m.AgentMonitoringDashboard }))
);

// ═══ HELPERS ═══

function buildReviewDataFromFlow(flowDef: any, agentName: string, qualityModel: string): ReviewData {
  const briefing = flowDef?.briefing || {};
  const boardroomOutput = flowDef?.boardroom_output || {};

  const nodes = flowDef?.nodes?.length > 0
    ? flowDef.nodes.map((n: any) => ({ id: n.id, type: n.type || "llm", label: n.data?.label || n.id }))
    : [
        { id: "trigger_1", type: "trigger", label: "Trigger" },
        { id: "llm_1", type: "llm", label: "LLM Principal" },
        { id: "guard_1", type: "output_guard", label: "Output Guard" },
      ];
  const edges = flowDef?.edges?.length > 0
    ? flowDef.edges.map((e: any) => ({ source: e.source, target: e.target }))
    : [
        { source: "trigger_1", target: "llm_1" },
        { source: "llm_1", target: "guard_1" },
      ];

  return {
    agentName,
    genome: boardroomOutput.genome || briefing.architecture_type || "Personalizado",
    nodes,
    edges,
    prompts: boardroomOutput.prompts || [
      { nodeId: "LLM Principal", preview: briefing.prompt || "System prompt será gerado pelo Prometheus..." },
    ],
    testResults: boardroomOutput.testResults || [],
    passRate: boardroomOutput.passRate || 0,
    qualityScore: boardroomOutput.qualityScore || 0,
    costPerInteraction: estimateAgentCost(qualityModel),
    channels: briefing.channels || [],
  };
}

const PHASE_LABELS: Record<string, string> = {
  boardroom: "Planejamento",
  architecture_brief: "Arquitetura",
  building: "Construção",
  review: "Revisão",
};

// ═══ MAIN COMPONENT ═══

function readBriefingPrompt(flowDef: unknown): string {
  const briefing = (flowDef as { briefing?: { prompt?: unknown } } | null)?.briefing;
  return typeof briefing?.prompt === "string" ? briefing.prompt.trim() : "";
}

function readBriefingQualityModel(flowDef: unknown): string {
  const briefing = (flowDef as { briefing?: { quality_model?: unknown } } | null)?.briefing;
  return typeof briefing?.quality_model === "string" ? briefing.quality_model.trim() : "";
}

const DEFAULT_LAUNCH_QUALITY_MODEL = "google/gemini-2.5-flash";

export interface AdminAgentBuilderViewProps {
  projectId: string;
  projectName?: string;
  /** De projects.meta.initialPrompt (dashboard / CreateAgentDialog). */
  initialPrompt?: string | null;
  /** Dashboard link Fluxo Visual: abre React Flow ao entrar. */
  initialOpenFlow?: boolean;
  onImmersiveChange?: (active: boolean) => void;
}

const IMMERSIVE_PHASES = new Set([
  "boardroom",
  "architecture_brief",
  "building",
  "review",
]);

export default function AdminAgentBuilderView({
  projectId,
  projectName,
  initialPrompt,
  initialOpenFlow = false,
  onImmersiveChange,
}: AdminAgentBuilderViewProps) {
  const {
    flows, loading,
    selectedFlowId, builderOpen,
    handleCreate, handleDelete,
    openBuilder, closeBuilder,
  } = useAgentFlows(projectId);

  if (typeof window !== "undefined") {
    migrateLegacyPrometheusStorage(projectId);
  }
  purgeOrphanPrometheusStorageOnce();

  const [pipeline, dispatch] = useReducer(prometheusReducer, initialPrometheusPipelineState, (init) => {
    try {
      const savedPhase = readPsPipelineField(projectId, "phase");
      const savedFlowId = readPsPipelineField(projectId, "flow_id");
      const savedPrompt = readPsPipelineField(projectId, "prompt") || "";
      const savedModel = readPsPipelineField(projectId, "quality_model") || "";
      if (
        savedPhase &&
        ["boardroom", "architecture_brief", "review"].includes(savedPhase) &&
        savedPrompt
      ) {
        return { ...init, phase: savedPhase as PrometheusUIPhase, flowId: savedFlowId, launchPrompt: savedPrompt, launchQualityModel: savedModel };
      }
      if (savedPhase && ["boardroom", "architecture_brief", "building", "review"].includes(savedPhase)) {
        return { ...init, phase: savedPhase as PrometheusUIPhase, flowId: savedFlowId };
      }
    } catch {}
    return init;
  });

  const { phase } = pipeline;

  const hydratedPrompt = useMemo(() => {
    const fromMeta = initialPrompt?.trim() || "";
    if (fromMeta) return fromMeta;
    const draft = findProjectDraft(flows);
    return draft ? readBriefingPrompt(draft.flow_definition) : "";
  }, [initialPrompt, flows]);

  const skipHomePrompt = !!initialPrompt?.trim();
  const autoLaunchRef = useRef(false);
  const openFlowHandledRef = useRef(false);
  const [autoLaunching, setAutoLaunching] = useState(skipHomePrompt);

  // Persist phase
  const setPhase = useCallback((p: PrometheusUIPhase) => {
    dispatch({ type: "SET_PHASE", phase: p });
    writePsPipelineField(projectId, "phase", p);
  }, [projectId]);

  // ═══ PHASE HANDLERS ═══

  // Home → Boardroom (Step 16: Skip onboarding, go directly to enrichment → boardroom)
  const handleLaunch = useCallback(async (config: { prompt: string; qualityModel: string; fallbackModelId?: string }) => {
    setResolvedQualityModel(config.qualityModel);
    dispatch({ type: "SET_LAUNCH", prompt: config.prompt, qualityModel: config.qualityModel });
    writePsPipelineField(projectId, "prompt", config.prompt);
    writePsPipelineField(projectId, "quality_model", config.qualityModel);

    // Create agent_flows draft row directly (was done in onboarding before)
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      console.error("[launch] No authenticated user");
      const { toast } = await import("sonner");
      toast.error("Você precisa estar autenticado para criar um agente.");
      return;
    }

    const flowName =
      config.prompt.slice(0, 50) + (config.prompt.length > 50 ? "..." : "");
    const briefing = {
      prompt: config.prompt,
      quality_model: config.qualityModel,
      fallback_model_id: config.fallbackModelId || null,
    };

    const existingDraft = findProjectDraft(flows);
    const { flowId, error: upsertErr } = await upsertProjectDraftFlow(supabase, {
      projectId,
      userId: userData.user.id,
      name: flowName,
      description: config.prompt,
      briefing,
      existingDraft,
    });

    if (upsertErr || !flowId) {
      console.error("[launch] Failed to upsert draft flow:", upsertErr);
      const { toast } = await import("sonner");
      toast.error("Erro ao salvar rascunho do agente. Tente novamente.");
      return;
    }

    if (!flowId) return;
    dispatch({ type: "SET_FLOW_ID", flowId });
    writePsPipelineField(projectId, "flow_id", flowId);
    // Skip onboarding → go directly to boardroom (enrichment happens server-side in cortex)
    setPhase("boardroom");
    setAutoLaunching(false);
  }, [setPhase, projectId, flows]);

  useEffect(() => {
    onImmersiveChange?.(IMMERSIVE_PHASES.has(phase) || builderOpen);
  }, [phase, builderOpen, onImmersiveChange]);

  // Dashboard Fluxo Visual → abre React Flow
  useEffect(() => {
    if (!initialOpenFlow || loading || openFlowHandledRef.current) return;
    openFlowHandledRef.current = true;
    setAutoLaunching(false);

    const draft = findProjectDraft(flows);
    if (draft) {
      openBuilder(draft.id);
      return;
    }
    void handleCreate();
  }, [initialOpenFlow, loading, flows, openBuilder, handleCreate]);

  // Dashboard prompt → boardroom direto (sem PrometheusHome duplicado)
  useEffect(() => {
    if (initialOpenFlow) return;
    if (!skipHomePrompt || loading || autoLaunchRef.current || phase !== "home") return;

    const prompt = hydratedPrompt.trim();
    if (prompt.length < 10) {
      setAutoLaunching(false);
      return;
    }

    autoLaunchRef.current = true;
    setAutoLaunching(true);

    const draft = findProjectDraft(flows);
    const qualityModel =
      (draft ? readBriefingQualityModel(draft.flow_definition) : "") ||
      readPsPipelineField(projectId, "quality_model") ||
      DEFAULT_LAUNCH_QUALITY_MODEL;

    void handleLaunch({ prompt, qualityModel });
  }, [
    skipHomePrompt,
    loading,
    phase,
    hydratedPrompt,
    flows,
    projectId,
    handleLaunch,
  ]);

  // Boardroom → Architecture Brief
  const handleBoardroomAdvance = useCallback(() => {
    setPhase("architecture_brief");
  }, [setPhase]);

  const invokeSessionIntent = useCallback(async (
    action: "approve" | "request_changes" | "reject_plan" | "halt",
    feedback?: string,
  ) => {
    if (!pipeline.flowId) return null;
    const { data: sessions } = await supabase
      .from("prometheus_build_sessions" as any)
      .select("id, phase")
      .eq("target_flow_id", pipeline.flowId)
      .not("phase", "eq", "complete")
      .order("created_at", { ascending: false })
      .limit(1);
    const session = sessions?.[0] as unknown as { id: string; phase: string } | undefined;
    if (!session) return null;
    await supabase.functions.invoke("prometheus-builder", {
      body: { action, session_id: session.id, feedback },
    });
    return session;
  }, [pipeline.flowId]);

  const handleBriefApprove = useCallback(async (editedBrief?: { objective?: string }) => {
    if (editedBrief?.objective && pipeline.flowId) {
      try {
        const { data: flowData } = await supabase
          .from("agent_flows")
          .select("flow_definition")
          .eq("id", pipeline.flowId)
          .single();
        const flowDef = (flowData?.flow_definition as Record<string, unknown>) || {};
        const boardroomOutput = (flowDef.boardroom_output as Record<string, unknown>) || {};
        await supabase.from("agent_flows").update({
          flow_definition: {
            ...flowDef,
            boardroom_output: { ...boardroomOutput, objective: editedBrief.objective },
          },
        }).eq("id", pipeline.flowId);
      } catch (err) {
        console.warn("[brief-approve] Failed to persist objective edit:", err);
      }
    }
    try {
      await invokeSessionIntent("approve");
    } catch (err) {
      console.warn("[brief-approve] Failed to send approval:", err);
    }
    setPhase("building");
  }, [invokeSessionIntent, pipeline.flowId, setPhase]);

  const handleBriefRefine = useCallback(async () => {
    try {
      await invokeSessionIntent("request_changes");
    } catch (err) {
      console.warn("[brief-refine] Failed to request changes:", err);
    }
    setPhase("boardroom");
  }, [invokeSessionIntent, setPhase]);

  const handleBriefReject = useCallback(async () => {
    try {
      await invokeSessionIntent("reject_plan");
    } catch (err) {
      console.warn("[brief-reject] Failed to reject plan:", err);
    }
    setPhase("boardroom");
  }, [invokeSessionIntent, setPhase]);

  // Building → Review
  const handleBuildingComplete = useCallback(() => {
    setPhase("review");
  }, [setPhase]);

  // Review → Builder (B7: use output_flow_id from session when available)
  const handleOpenBuilder = useCallback(async () => {
    let targetFlowId = pipeline.flowId;

    if (pipeline.flowId) {
      try {
        const { data: sessionData } = await supabase
          .from("prometheus_build_sessions" as any)
          .select("output_flow_id")
          .eq("target_flow_id", pipeline.flowId)
          .not("output_flow_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (sessionData?.length && (sessionData[0] as any).output_flow_id) {
          targetFlowId = (sessionData[0] as any).output_flow_id;
        }
      } catch (err) {
        console.warn("[B7] Failed to fetch output_flow_id:", err);
      }
    }

    if (targetFlowId) {
      openBuilder(targetFlowId);
      setPhase("home");
      removePsPipelineField(projectId, "phase");
      removePsPipelineField(projectId, "flow_id");
    }
  }, [pipeline.flowId, openBuilder, setPhase, projectId]);

  // Review → Architecture Brief (adjust)
  const handleAdjust = useCallback(() => {
    setPhase("architecture_brief");
  }, [setPhase]);

  // Review → Deploy
  const handleDeploy = useCallback(async () => {
    if (!pipeline.flowId) return;

    try {
      // Find the active session for this flow
      const { data: sessions } = await supabase
        .from("prometheus_build_sessions" as any)
        .select("id, phase")
        .eq("target_flow_id", pipeline.flowId)
        .not("phase", "eq", "complete")
        .order("created_at", { ascending: false })
        .limit(1);

      const session = sessions?.[0] as unknown as { id: string; phase: string } | undefined;

      if (session?.phase === "review") {
        // Tell the backend FSM to deploy — this triggers saveFlowToAgentFlows
        await supabase.functions.invoke("prometheus-builder", {
          body: { action: "message", session_id: session.id, message: "deploy" },
        });

        // Poll until the session reaches "complete" with output_flow_id (max ~30s)
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const { data: check } = await supabase
            .from("prometheus_build_sessions" as any)
            .select("phase, output_flow_id")
            .eq("id", session.id)
            .single();
          const s = check as { phase?: string; output_flow_id?: string } | null;
          if (s?.phase === "complete" && s?.output_flow_id) {
            // Publish the CORRECT output flow (with prompts)
            await supabase
              .from("agent_flows")
              .update({ status: "published" })
              .eq("id", s.output_flow_id);
            break;
          }
        }
      } else {
        // Fallback: publish the draft flow directly
        await supabase
          .from("agent_flows")
          .update({ status: "published" })
          .eq("id", pipeline.flowId);
      }
    } catch (err) {
      console.error("[deploy] Error:", err);
      const { toast } = await import("sonner");
      toast.error("Erro ao ativar agente. Tente novamente.");
      return;
    }

    handleOpenBuilder();
  }, [pipeline.flowId, handleOpenBuilder]);

  const handleOpenMonitoring = useCallback(() => {
    setWorkflowPhase(undefined);
    setPhase("monitoring");
  }, [setPhase]);

  const handleGoHome = useCallback(() => {
    window.location.href = "/agents";
  }, []);

  const handleBuilderClose = useCallback(() => {
    closeBuilder();
  }, [closeBuilder]);

  // Build review data when entering review phase
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [workflowPhase, setWorkflowPhase] = useState<BoardroomPhase | undefined>(undefined);
  const [convergenceScore, setConvergenceScore] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [resolvedQualityModel, setResolvedQualityModel] = useState(pipeline.launchQualityModel);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(true);

  const handleConvergenceChange = useCallback((score: number, round: number) => {
    setConvergenceScore(score);
    setCurrentRound(round);
  }, []);

  useEffect(() => {
    if (phase !== "review" || !pipeline.flowId) return;
    (async () => {
      // Load flow data for basic info
      const { data: flowData } = await supabase
        .from("agent_flows")
        .select("flow_definition, name")
        .eq("id", pipeline.flowId!)
        .single();
      const flowDef = flowData?.flow_definition || {};
      const name = pipeline.launchPrompt.slice(0, 40) || flowData?.name || "Agente";
      const base = buildReviewDataFromFlow(flowDef, name, pipeline.launchQualityModel);

      // Enrich with session data (test results, prompts, architecture)
      try {
        const { data: sessions } = await supabase
          .from("prometheus_build_sessions" as any)
          .select("architecture, prompts, test_results, requirements")
          .eq("target_flow_id", pipeline.flowId!)
          .order("created_at", { ascending: false })
          .limit(1);

        const session = sessions?.[0] as {
          architecture?: { nodes: any[]; edges: any[]; genome_name?: string; estimated_cost_per_interaction?: number };
          prompts?: Record<string, { system_prompt: string; description: string }>;
          test_results?: { test_results: any[]; pass_rate: number; avg_quality: number };
          requirements?: { channels?: string[] };
        } | undefined;

        if (session) {
          if (session.architecture?.nodes?.length) {
            base.nodes = session.architecture.nodes.map((n: any) => ({
              id: n.id, type: n.type || "llm", label: n.label || n.id,
            }));
            base.edges = session.architecture.edges?.map((e: any) => ({
              source: e.source, target: e.target,
            })) || [];
            base.genome = session.architecture.genome_name || base.genome;
            base.costPerInteraction = session.architecture.estimated_cost_per_interaction ?? base.costPerInteraction;
          }
          if (session.prompts) {
            base.prompts = Object.entries(session.prompts).map(([nodeId, p]: [string, any]) => ({
              nodeId, preview: p.system_prompt?.substring(0, 120) || p.description || "",
            }));
          }
          if (session.test_results) {
            base.testResults = session.test_results.test_results?.map((r: any) => ({
              name: r.test_case?.name, category: r.test_case?.category,
              passed: r.passed, score: r.eval_scores?.aggregate,
            })) || [];
            base.passRate = session.test_results.pass_rate ?? 0;
            base.qualityScore = session.test_results.avg_quality ?? 0;
          }
          if (session.requirements?.channels?.length) {
            base.channels = session.requirements.channels;
          }
        }
      } catch (err) {
        console.warn("[review] Failed to enrich from session:", err);
      }

      setReviewData(base);
    })();
  }, [phase, pipeline.flowId, pipeline.launchPrompt, pipeline.launchQualityModel]);

  useEffect(() => {
    if (pipeline.launchQualityModel) {
      setResolvedQualityModel(pipeline.launchQualityModel);
    }
  }, [pipeline.launchQualityModel]);

  useEffect(() => {
    if (!pipeline.flowId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("agent_flows")
        .select("flow_definition")
        .eq("id", pipeline.flowId!)
        .single();

      const modelId = (data?.flow_definition as any)?.briefing?.quality_model;
      if (!cancelled && typeof modelId === "string" && modelId.trim()) {
        setResolvedQualityModel(modelId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pipeline.flowId]);

  // ═══ ACTIVE SESSION DETECTION (Resume) ═══
  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    flowId: string;
    phase: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (phase !== "home") return;
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user || cancelled) return;

      // Cleanup stale sessions (>10 min without update, not complete)
      try {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await supabase
          .from("prometheus_build_sessions" as any)
          .update({ phase: "complete" } as any)
          .eq("user_id", userData.user.id)
          .neq("phase", "complete")
          .lt("updated_at", tenMinAgo);
      } catch (err) {
        console.warn("[cleanup] stale session cleanup error:", err);
      }

      const { data: sessions } = await supabase
        .from("prometheus_build_sessions" as any)
        .select("id, phase, target_flow_id, requirements")
        .eq("user_id", userData.user.id)
        .neq("phase", "complete")
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled || !sessions?.length) { setActiveSession(null); return; }
      const s = sessions[0] as any;
      if (!s.target_flow_id) { setActiveSession(null); return; }
      setActiveSession({
        sessionId: s.id,
        flowId: s.target_flow_id,
        phase: s.phase,
        name: (s.requirements as any)?.objective || "Agente em construção",
      });
    })();
    return () => { cancelled = true; };
  }, [phase]);

  const PHASE_STATUS_LABELS: Record<string, string> = {
    discovery: "Descoberta",
    clarification: "Clarificação",
    planning: "Planejamento",
    approval: "Aprovação",
    building: "Construção",
    testing: "Testes",
    review: "Revisão",
    deploying: "Deploy",
  };

  const resumeSession = useMemo(() => {
    if (!activeSession) return null;
    return {
      projectName: activeSession.name,
      statusLabel: PHASE_STATUS_LABELS[activeSession.phase] || activeSession.phase,
      phase: activeSession.phase,
      onResume: () => {
        dispatch({ type: "SET_FLOW_ID", flowId: activeSession.flowId });
        writePsPipelineField(projectId, "flow_id", activeSession.flowId);
        // Resume to correct UI phase based on backend phase
        const buildPhases = ["building", "testing", "review", "deploying"];
        if (buildPhases.includes(activeSession.phase)) {
          setPhase("building");
        } else if (activeSession.phase === "approval") {
          setPhase("architecture_brief");
        } else {
          setPhase("boardroom");
        }
      },
    };
  }, [activeSession, setPhase, projectId]);

  // ═══ RESUME / OPEN AGENT BY FLOW ID ═══
  const handleResumeOrOpenFlow = useCallback(async (flowId: string) => {
    // Check if there's an active session for this flow
    try {
      const { data: sessions } = await supabase
        .from("prometheus_build_sessions" as any)
        .select("id, phase")
        .eq("target_flow_id", flowId)
        .neq("phase", "complete")
        .order("created_at", { ascending: false })
        .limit(1);

      const session = sessions?.[0] as unknown as { id: string; phase: string } | undefined;
      if (session) {
        dispatch({ type: "SET_FLOW_ID", flowId });
        writePsPipelineField(projectId, "flow_id", flowId);
        const buildPhases = ["building", "testing", "review", "deploying"];
        if (buildPhases.includes(session.phase)) {
          setPhase("building");
        } else if (session.phase === "approval") {
          setPhase("architecture_brief");
        } else {
          setPhase("boardroom");
        }
        return;
      }
    } catch {}

    // No active session — check if it's a published/complete agent → open builder
    const { data: flowData } = await supabase
      .from("agent_flows")
      .select("status")
      .eq("id", flowId)
      .single();

    if (flowData?.status === "published") {
      openBuilder(flowId);
    } else {
      // Draft with no session — start fresh boardroom
      dispatch({ type: "SET_FLOW_ID", flowId });
      writePsPipelineField(projectId, "flow_id", flowId);
      setPhase("boardroom");
    }
  }, [setPhase, openBuilder, projectId]);

  // ═══ HOME DATA ═══
  const recentAgents = flows.slice(0, 20).map(f => {
    let nodesCount = 0;
    try {
      const flowDef = (f as any).flow_definition;
      if (flowDef?.nodes?.length) nodesCount = flowDef.nodes.length;
    } catch {}
    return {
      id: f.id,
      name: f.name,
      status: f.status,
      nodesCount,
      lastRun: new Date(f.updated_at).toLocaleDateString("pt-BR"),
    };
  });

  const workflowPhaseForHeader = useMemo<BoardroomPhase | undefined>(() => {
    if (phase === "architecture_brief") return "approval";
    if (phase === "review") return "complete";
    if (phase === "boardroom") return workflowPhase ?? "discovery";
    if (phase === "building") return workflowPhase ?? "building";
    return undefined;
  }, [phase, workflowPhase]);

  const fullScreenClass = IMMERSIVE_PHASES.has(phase) || builderOpen
    ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    : "-mx-3 lg:-mx-6 -mb-3 lg:-mb-6 -mt-3 lg:-mt-6 h-[calc(100dvh_-_4rem)] min-h-0 min-w-0";
  const loader = <PrometheusLoadingSkeleton />;

  // ═══ PHASE RENDERING ═══

  const showPhaseHeader = !["home", "monitoring", "boardroom"].includes(phase);

  if (phase === "monitoring") {
    return (
      <div className={`${fullScreenClass} overflow-hidden`}>
        <Suspense fallback={loader}>
          <AgentMonitoringDashboard onBack={handleGoHome} />
        </Suspense>
      </div>
    );
  }

  if (phase !== "home") {
    return (
      <div className={`${fullScreenClass} flex min-h-0 min-w-0 flex-col overflow-hidden`}>
        {showPhaseHeader && (
          <PrometheusPhaseHeader
            currentPhase={phase}
            workflowPhase={workflowPhaseForHeader}
            agentName={projectName}
            onGoHome={handleGoHome}
            qualityModel={resolvedQualityModel}
            convergenceScore={phase === "boardroom" ? undefined : convergenceScore}
            currentRound={phase === "boardroom" ? undefined : currentRound}
            isCollapsed={isHeaderCollapsed}
            onToggleCollapse={
              phase === "boardroom" ? undefined : () => setIsHeaderCollapsed((prev) => !prev)
            }
          />
        )}

        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <PrometheusPhaseTransition
            phaseKey={phase}
            phaseLabel={PHASE_LABELS[phase]}
          >
            <Suspense fallback={loader}>
              {/* ONBOARDING DISCONNECTED — component preserved, flow goes home → boardroom directly */}

              {phase === "boardroom" && pipeline.flowId && (
                <PrometheusBoardroomPage
                  flowId={pipeline.flowId}
                  onBack={handleGoHome}
                  onAdvance={handleBoardroomAdvance}
                  onWorkflowPhaseChange={setWorkflowPhase}
                  onConvergenceChange={handleConvergenceChange}
                />
              )}

              {phase === "architecture_brief" && pipeline.flowId && (
                <PrometheusArchitectureBrief
                  flowId={pipeline.flowId}
                  qualityModel={pipeline.launchQualityModel}
                  onApprove={handleBriefApprove}
                  onRefine={handleBriefRefine}
                  onReject={handleBriefReject}
                  onBack={() => setPhase("boardroom")}
                />
              )}

              {phase === "building" && pipeline.flowId && (
                <PrometheusStreamingPage
                  flowId={pipeline.flowId}
                  onBack={() => setPhase("architecture_brief")}
                  onComplete={handleBuildingComplete}
                  onWorkflowPhaseChange={setWorkflowPhase}
                />
              )}

              {phase === "review" && pipeline.flowId && reviewData && (
                <PrometheusReview
                  data={reviewData}
                  flowId={pipeline.flowId}
                  onOpenBuilder={handleOpenBuilder}
                  onAdjust={handleAdjust}
                  onDeploy={handleDeploy}
                  onBack={() => setPhase("building")}
                />
              )}
            </Suspense>
          </PrometheusPhaseTransition>
        </div>
        {builderOpen && selectedFlowId && (
          <FlowBuilderDialog
            flowId={selectedFlowId}
            open={builderOpen}
            onClose={handleBuilderClose}
          />
        )}
      </div>
    );
  }

  if (autoLaunching) {
    return (
      <div className={`${fullScreenClass} overflow-auto`}>
        <PrometheusLoadingSkeleton />
      </div>
    );
  }

  // Home
  return (
    <div className={`${fullScreenClass} overflow-auto`}>
      <PrometheusHome
        initialPrompt={hydratedPrompt}
        onLaunch={handleLaunch}
        onOpenBuilder={handleCreate}
        onOpenBuilderWithFlow={handleResumeOrOpenFlow}
        resumeSession={resumeSession}
        recentAgents={recentAgents}
        onOpenAgent={handleResumeOrOpenFlow}
        onDeleteAgent={handleDelete}
        onOpenMonitoring={handleOpenMonitoring}
      />
      {builderOpen && selectedFlowId && (
        <FlowBuilderDialog
          flowId={selectedFlowId}
          open={builderOpen}
          onClose={handleBuilderClose}
        />
      )}
    </div>
  );
}
