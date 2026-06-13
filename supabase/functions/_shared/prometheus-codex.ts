/**
 * prometheus-codex.ts — Empirical Learning System for Genome Optimization
 * Phase 7: Codex aggregates build outcomes, identifies winning patterns,
 * and provides insights for future agent construction.
 *
 * CRITICAL: No hardcoded models. Uses model_id from caller.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { routeLLM } from "./llm-router.ts";

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ═══ TYPES ═══

export interface GenomeInsight {
  genome_id: string;
  genome_key: string;
  genome_name: string;
  domain: string;
  total_builds: number;
  success_rate: number;
  avg_quality: number;
  avg_pass_rate: number;
  avg_build_time_s: number;
  avg_iterations: number;
  top_models: string[];
  trend: "improving" | "stable" | "declining";
}

export interface CodexReport {
  total_genomes: number;
  total_builds: number;
  insights: GenomeInsight[];
  recommendations: string[];
  generated_at: string;
}

// ═══ CORE: AGGREGATE PERFORMANCE DATA ═══

export async function getCodexReport(userId: string): Promise<CodexReport> {
  const sb = supabaseAdmin();

  // Fetch all genomes
  const { data: genomes } = await sb
    .from("codex_genomes")
    .select("id, genome_key, name, domain, is_active")
    .eq("is_active", true);

  if (!genomes?.length) {
    return { total_genomes: 0, total_builds: 0, insights: [], recommendations: ["Nenhum genome cadastrado no Codex."], generated_at: new Date().toISOString() };
  }

  // Fetch all performance records
  const { data: perfRows } = await sb
    .from("codex_empirical_performance")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = perfRows || [];

  // Aggregate per genome
  const map: Record<string, {
    builds: number; successes: number; qualities: number[]; passRates: number[];
    buildTimes: number[]; iterations: number[]; models: Record<string, number>;
    recentQualities: number[];
  }> = {};

  for (const r of rows) {
    const gid = r.genome_id;
    if (!gid) continue;
    if (!map[gid]) map[gid] = { builds: 0, successes: 0, qualities: [], passRates: [], buildTimes: [], iterations: [], models: {}, recentQualities: [] };
    const e = map[gid];
    e.builds++;
    if (r.build_success) e.successes++;
    if (r.avg_quality != null) {
      e.qualities.push(r.avg_quality);
      if (e.qualities.length <= 10) e.recentQualities.push(r.avg_quality);
    }
    if (r.pass_rate != null) e.passRates.push(r.pass_rate);
    if (r.build_time_seconds != null) e.buildTimes.push(r.build_time_seconds);
    if (r.iterations_needed != null) e.iterations.push(r.iterations_needed);
    if (r.model_used) e.models[r.model_used] = (e.models[r.model_used] || 0) + 1;
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const insights: GenomeInsight[] = genomes.map((g: any) => {
    const d = map[g.id];
    if (!d) {
      return {
        genome_id: g.id, genome_key: g.genome_key, genome_name: g.name, domain: g.domain || "geral",
        total_builds: 0, success_rate: 0, avg_quality: 0, avg_pass_rate: 0, avg_build_time_s: 0,
        avg_iterations: 0, top_models: [], trend: "stable" as const,
      };
    }

    // Trend detection: compare recent 5 vs older
    let trend: "improving" | "stable" | "declining" = "stable";
    if (d.qualities.length >= 6) {
      const recent = avg(d.qualities.slice(0, 3));
      const older = avg(d.qualities.slice(-3));
      const diff = recent - older;
      if (diff > 0.05) trend = "improving";
      else if (diff < -0.05) trend = "declining";
    }

    const topModels = Object.entries(d.models).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);

    return {
      genome_id: g.id,
      genome_key: g.genome_key,
      genome_name: g.name,
      domain: g.domain || "geral",
      total_builds: d.builds,
      success_rate: d.builds > 0 ? Math.round((d.successes / d.builds) * 100) : 0,
      avg_quality: Math.round(avg(d.qualities) * 100) / 100,
      avg_pass_rate: Math.round(avg(d.passRates) * 100) / 100,
      avg_build_time_s: Math.round(avg(d.buildTimes)),
      avg_iterations: Math.round(avg(d.iterations) * 10) / 10,
      top_models: topModels,
      trend,
    };
  }).sort((a, b) => b.total_builds - a.total_builds);

  // Generate recommendations
  const recommendations: string[] = [];
  const declining = insights.filter(i => i.trend === "declining" && i.total_builds >= 3);
  if (declining.length) {
    recommendations.push(`⚠️ ${declining.length} genome(s) com tendência de queda: ${declining.map(d => d.genome_name).join(", ")}`);
  }
  const lowQuality = insights.filter(i => i.avg_quality > 0 && i.avg_quality < 0.6 && i.total_builds >= 2);
  if (lowQuality.length) {
    recommendations.push(`🔧 Genomes com qualidade abaixo de 60%: ${lowQuality.map(d => d.genome_name).join(", ")} — considere revisão de prompts.`);
  }
  const highIterations = insights.filter(i => i.avg_iterations > 2 && i.total_builds >= 2);
  if (highIterations.length) {
    recommendations.push(`🔄 Genomes com muitas iterações (>2): ${highIterations.map(d => d.genome_name).join(", ")} — estrutura pode ser otimizada.`);
  }
  if (!recommendations.length) {
    recommendations.push("✅ Todos os genomes estão dentro dos parâmetros esperados.");
  }

  return {
    total_genomes: genomes.length,
    total_builds: rows.length,
    insights,
    recommendations,
    generated_at: new Date().toISOString(),
  };
}

// ═══ LLM-POWERED OPTIMIZATION SUGGESTIONS ═══

export async function generateOptimizationInsights(
  userId: string,
  modelId: string,
): Promise<{ suggestions: string; model_used: string }> {
  if (!modelId) {
    return { suggestions: "Modelo não selecionado — selecione um modelo no power selector.", model_used: "none" };
  }

  const report = await getCodexReport(userId);
  const activeInsights = report.insights.filter(i => i.total_builds > 0);

  if (activeInsights.length === 0) {
    return { suggestions: "Ainda não há dados empíricos suficientes. Construa mais agentes para gerar insights.", model_used: "skip" };
  }

  const prompt = `Você é um analista de performance de agentes de IA. Analise os dados abaixo e forneça 3-5 recomendações práticas para melhorar a qualidade dos agentes.

DADOS DE PERFORMANCE DOS GENOMES:
${JSON.stringify(activeInsights, null, 2)}

RECOMENDAÇÕES AUTOMÁTICAS:
${report.recommendations.join("\n")}

Responda em português, de forma concisa e acionável. Foque em:
1. Quais genomes precisam de atenção
2. Padrões de modelos que funcionam melhor
3. Otimizações de estrutura (nós, iterações)
4. Tendências preocupantes`;

  try {
    const result = await routeLLM({
      model_id: modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
      tenant_id: userId,
    });
    return { suggestions: result.content, model_used: modelId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return { suggestions: `Não foi possível gerar insights: ${msg}`, model_used: "error" };
  }
}
