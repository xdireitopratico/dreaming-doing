/**
 * prometheus-physician.ts — Post-deploy diagnostic agent
 * ROADMAP-03 Phase 6: Monitors agent health, diagnoses issues, suggests fixes
 * 
 * Capabilities:
 * 1. Health Check — analyzes recent executions for error patterns
 * 2. Diagnosis — identifies root cause of failures (model, prompt, tool, config)
 * 3. Prescription — generates actionable fix recommendations
 * 4. Auto-fix — applies safe fixes (prompt tuning, config changes)
 */

import { routeLLM } from "./llm-router.ts";
import { supabaseAdmin } from "./prometheus-db.ts";

export interface HealthReport {
  flow_id: string;
  agent_name: string;
  status: "healthy" | "degraded" | "critical";
  error_rate: number;
  avg_latency_ms: number;
  total_executions: number;
  top_errors: Array<{ message: string; count: number; node_type: string }>;
  slow_nodes: Array<{ node_id: string; node_type: string; avg_ms: number }>;
  last_check: string;
}

export interface Diagnosis {
  id: string;
  category: "model" | "prompt" | "tool" | "config" | "integration" | "performance";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  root_cause: string;
  prescription: string;
  auto_fixable: boolean;
  fix_action?: {
    type: "update_prompt" | "update_config" | "update_model" | "add_guard";
    target_node_id?: string;
    payload: Record<string, unknown>;
  };
}

export interface PhysicianReport {
  health: HealthReport;
  diagnoses: Diagnosis[];
  overall_recommendation: string;
  checked_at: string;
}

// ═══ HEALTH CHECK ═══

export async function runHealthCheck(flowId: string, userId: string): Promise<HealthReport> {
  const sb = supabaseAdmin();

  // Get flow info
  const { data: flow } = await sb
    .from("agent_flows")
    .select("name, status")
    .eq("id", flowId)
    .single();

  // Get recent executions (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: executions } = await sb
    .from("agent_executions")
    .select("id, status, error_message, total_duration_ms, steps, created_at")
    .eq("flow_id", flowId)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(200);

  const execs = executions || [];
  const totalExecutions = execs.length;
  const errors = execs.filter(e => e.status === "error" || e.status === "failed");
  const errorRate = totalExecutions > 0 ? errors.length / totalExecutions : 0;

  // Aggregate error messages
  const errorMap = new Map<string, { count: number; node_type: string }>();
  for (const err of errors) {
    const msg = err.error_message || "Unknown error";
    const shortMsg = msg.substring(0, 100);
    const existing = errorMap.get(shortMsg);
    if (existing) {
      existing.count++;
    } else {
      // Try to extract node_type from steps
      const steps = (err.steps as any[]) || [];
      const failedStep = steps.find((s: any) => s.status === "error");
      errorMap.set(shortMsg, { count: 1, node_type: failedStep?.node_type || "unknown" });
    }
  }

  const topErrors = Array.from(errorMap.entries())
    .map(([message, data]) => ({ message, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Identify slow nodes
  const nodeLatencies = new Map<string, { total: number; count: number; type: string }>();
  for (const exec of execs) {
    const steps = (exec.steps as any[]) || [];
    for (const step of steps) {
      if (step.duration_ms && step.node_id) {
        const existing = nodeLatencies.get(step.node_id);
        if (existing) {
          existing.total += step.duration_ms;
          existing.count++;
        } else {
          nodeLatencies.set(step.node_id, { total: step.duration_ms, count: 1, type: step.node_type || "unknown" });
        }
      }
    }
  }

  const slowNodes = Array.from(nodeLatencies.entries())
    .map(([node_id, data]) => ({ node_id, node_type: data.type, avg_ms: Math.round(data.total / data.count) }))
    .filter(n => n.avg_ms > 3000) // >3s is slow
    .sort((a, b) => b.avg_ms - a.avg_ms)
    .slice(0, 5);

  const avgLatency = execs.length > 0
    ? Math.round(execs.reduce((sum, e) => sum + (e.total_duration_ms || 0), 0) / execs.length)
    : 0;

  let status: HealthReport["status"] = "healthy";
  if (errorRate > 0.3) status = "critical";
  else if (errorRate > 0.1) status = "degraded";

  return {
    flow_id: flowId,
    agent_name: flow?.name || "Unknown",
    status,
    error_rate: Math.round(errorRate * 100) / 100,
    avg_latency_ms: avgLatency,
    total_executions: totalExecutions,
    top_errors: topErrors,
    slow_nodes: slowNodes,
    last_check: new Date().toISOString(),
  };
}

// ═══ DIAGNOSIS ═══

const PHYSICIAN_PROMPT = `You are Physician, an AI agent specialized in diagnosing and fixing AI agent issues.
You analyze execution data and provide precise diagnoses with actionable fixes.

Given the health report below, generate diagnoses for each issue found.

HEALTH REPORT:
"""
{{HEALTH_REPORT}}
"""

For each issue, provide:
1. category: model | prompt | tool | config | integration | performance
2. severity: low | medium | high | critical
3. title: Short description (max 60 chars)
4. description: What's happening
5. root_cause: Why it's happening
6. prescription: How to fix it
7. auto_fixable: true if it can be fixed automatically (prompt adjustments, config changes)

Also provide an overall_recommendation summarizing the agent's state and top priority action.

Respond in valid JSON:
{
  "diagnoses": [...],
  "overall_recommendation": "string"
}`;

export async function runDiagnosis(
  health: HealthReport,
  modelId: string,
  tenantId?: string,
): Promise<{ diagnoses: Diagnosis[]; overall_recommendation: string }> {
  // If agent is healthy with no errors, skip LLM call
  if (health.status === "healthy" && health.top_errors.length === 0 && health.slow_nodes.length === 0) {
    return {
      diagnoses: [],
      overall_recommendation: "Agente saudável. Nenhum problema detectado nos últimos 7 dias.",
    };
  }

  const prompt = PHYSICIAN_PROMPT.replace("{{HEALTH_REPORT}}", JSON.stringify(health, null, 2));

  try {
    const result = await routeLLM({
      model_id: modelId,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Analyze and diagnose." },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      tenant_id: tenantId,
    });

    const content = result.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        diagnoses: [],
        overall_recommendation: content.substring(0, 300),
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const diagnoses: Diagnosis[] = (parsed.diagnoses || []).map((d: any, i: number) => ({
      id: `diag_${Date.now()}_${i}`,
      category: d.category || "config",
      severity: d.severity || "medium",
      title: d.title || "Issue detected",
      description: d.description || "",
      root_cause: d.root_cause || "",
      prescription: d.prescription || "",
      auto_fixable: d.auto_fixable || false,
      fix_action: d.fix_action || undefined,
    }));

    return {
      diagnoses,
      overall_recommendation: parsed.overall_recommendation || "Análise concluída.",
    };
  } catch (err) {
    console.error("[physician] Diagnosis LLM error:", err);
    // Fallback: generate rule-based diagnoses
    return generateRuleBasedDiagnoses(health);
  }
}

// ═══ RULE-BASED FALLBACK ═══

function generateRuleBasedDiagnoses(health: HealthReport): { diagnoses: Diagnosis[]; overall_recommendation: string } {
  const diagnoses: Diagnosis[] = [];

  // High error rate
  if (health.error_rate > 0.3) {
    diagnoses.push({
      id: `diag_err_${Date.now()}`,
      category: "config",
      severity: "critical",
      title: "Taxa de erro crítica",
      description: `${Math.round(health.error_rate * 100)}% das execuções falharam nos últimos 7 dias.`,
      root_cause: health.top_errors[0]?.message || "Erro recorrente não identificado",
      prescription: "Revise a configuração do modelo LLM e as credenciais API. Verifique se o modelo selecionado está acessível.",
      auto_fixable: false,
    });
  } else if (health.error_rate > 0.1) {
    diagnoses.push({
      id: `diag_err_${Date.now()}`,
      category: "prompt",
      severity: "high",
      title: "Taxa de erro elevada",
      description: `${Math.round(health.error_rate * 100)}% das execuções falharam.`,
      root_cause: health.top_errors[0]?.message || "Erros intermitentes",
      prescription: "Ajuste os prompts do agente para lidar melhor com entradas inesperadas. Considere adicionar um Output Guard.",
      auto_fixable: false,
    });
  }

  // Slow nodes
  for (const node of health.slow_nodes) {
    diagnoses.push({
      id: `diag_slow_${node.node_id}`,
      category: "performance",
      severity: node.avg_ms > 10000 ? "high" : "medium",
      title: `Nó lento: ${node.node_type}`,
      description: `Latência média de ${node.avg_ms}ms no nó ${node.node_id}.`,
      root_cause: node.node_type === "llm" ? "Modelo LLM com alta latência" : "Processamento demorado",
      prescription: node.node_type === "llm"
        ? "Considere usar um modelo mais rápido (ex: flash/mini) ou reduzir max_tokens."
        : "Verifique timeouts e otimize a integração.",
      auto_fixable: false,
    });
  }

  // Model-specific errors
  for (const err of health.top_errors) {
    if (err.message.includes("MODEL_NOT_CONFIGURED") || err.message.includes("missing_credentials")) {
      diagnoses.push({
        id: `diag_model_${Date.now()}`,
        category: "model",
        severity: "critical",
        title: "Credenciais do modelo ausentes",
        description: "O modelo LLM não tem credenciais configuradas.",
        root_cause: err.message,
        prescription: "Configure a API key do provedor em Configurações → Chaves API.",
        auto_fixable: false,
      });
    }
  }

  const overall = diagnoses.length === 0
    ? "Agente operando normalmente."
    : `${diagnoses.length} problema(s) detectado(s). Prioridade: ${diagnoses[0]?.title || "revisar configuração"}.`;

  return { diagnoses, overall_recommendation: overall };
}

// ═══ FULL PHYSICIAN REPORT ═══

export async function runPhysician(
  flowId: string,
  userId: string,
  modelId: string,
  tenantId?: string,
): Promise<PhysicianReport> {
  const health = await runHealthCheck(flowId, userId);
  const { diagnoses, overall_recommendation } = await runDiagnosis(health, modelId, tenantId);

  return {
    health,
    diagnoses,
    overall_recommendation,
    checked_at: new Date().toISOString(),
  };
}
