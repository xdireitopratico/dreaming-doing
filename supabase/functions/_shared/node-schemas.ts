/**
 * Forge Flow Node Config Schemas (Zod)
 * Shared validation for all 17 node types — used by frontend + edge functions.
 * Deno-compatible via npm:zod.
 */
import { z } from "npm:zod@3.24.4";

export const TriggerConfigSchema = z.object({
  channel: z.string().default("web"),
  cron_expression: z.string().optional(),
  webhook_path: z.string().optional(),
});
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

export const LLMConfigSchema = z.object({
  model_id: z.string().default(""),
  fallback_model_id: z.string().optional(),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  max_tokens: z.coerce.number().int().positive().default(1024),
  system_prompt: z.string().default(""),
  trial_model: z.boolean().optional(),
});
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export const ToolConfigSchema = z.object({
  tool_name: z.string().default(""),
  tool_display_name: z.string().optional(),
  required_secrets: z.array(z.string()).default([]),
  tool_args: z.record(z.unknown()).optional(),
});
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export const ConditionConfigSchema = z.object({
  expression: z.string().default(""),
});
export type ConditionConfig = z.infer<typeof ConditionConfigSchema>;

export const SwitchConfigSchema = z.object({
  cases: z.array(z.string()).default(["case_1", "case_2", "default"]),
  expression: z.string().optional(),
});
export type SwitchConfig = z.infer<typeof SwitchConfigSchema>;

const RULE_IDS = [
  "pii_mask", "legal_disclaimer", "no_guarantee",
  "max_length", "toxicity", "confidentiality",
  "regex_filter", "keyword_blacklist",
] as const;

export const GuardRuleSchema = z.object({
  id: z.enum(RULE_IDS),
  enabled: z.boolean().default(true),
  params: z.record(z.unknown()).optional(),
});
export type GuardRule = z.infer<typeof GuardRuleSchema>;

export const OutputGuardConfigSchema = z.object({
  guard_config: z.object({ rules: z.array(GuardRuleSchema).default([]) }).optional(),
  rules: z.array(z.string()).optional(),
});
export type OutputGuardConfig = z.infer<typeof OutputGuardConfigSchema>;

export const STTConfigSchema = z.object({
  language: z.string().default("pt-BR"),
  model: z.string().optional(),
});
export type STTConfig = z.infer<typeof STTConfigSchema>;

export const TTSConfigSchema = z.object({
  voice: z.string().default(""),
  language: z.string().optional(),
  speed: z.coerce.number().min(0.5).max(2).default(1).optional(),
});
export type TTSConfig = z.infer<typeof TTSConfigSchema>;

export const RAGSearchConfigSchema = z.object({
  top_k: z.coerce.number().int().positive().default(5),
  index_name: z.string().optional(),
  query_transform: z.boolean().optional(),
});
export type RAGSearchConfig = z.infer<typeof RAGSearchConfigSchema>;

export const MemoryConfigSchema = z.object({
  operation: z.enum(["read", "write"]).default("read"),
  key: z.string().default(""),
  ttl_seconds: z.coerce.number().int().positive().optional(),
});
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

export const HITLConfigSchema = z.object({
  timeout_minutes: z.coerce.number().int().positive().default(60),
  instructions: z.string().optional(),
  require_justification: z.boolean().optional(),
  notification_channel: z.string().optional(),
});
export type HITLConfig = z.infer<typeof HITLConfigSchema>;

export const LoopConfigSchema = z.object({
  max_iterations: z.coerce.number().int().positive().default(10),
  break_condition: z.string().optional(),
  continue_on_error: z.boolean().default(false),
});
export type LoopConfig = z.infer<typeof LoopConfigSchema>;

export const SubFlowConfigSchema = z.object({
  flow_name: z.string().default(""),
  flow_id: z.string().optional(),
  input_mapping: z.record(z.string()).optional(),
  wait_for_completion: z.boolean().default(true),
});
export type SubFlowConfig = z.infer<typeof SubFlowConfigSchema>;

export const DelayConfigSchema = z.object({
  seconds: z.coerce.number().int().positive().default(5),
  jitter_seconds: z.coerce.number().int().min(0).optional(),
});
export type DelayConfig = z.infer<typeof DelayConfigSchema>;

export const ErrorHandlerConfigSchema = z.object({
  retry_count: z.coerce.number().int().min(0).default(3),
  fallback: z.enum(["log_skip", "retry", "dlq"]).default("log_skip"),
  fallback_message: z.string().optional(),
});
export type ErrorHandlerConfig = z.infer<typeof ErrorHandlerConfigSchema>;

export const TransformerConfigSchema = z.object({
  template: z.string().default(""),
  input_mapping: z.record(z.string()).optional(),
  output_key: z.string().optional(),
});
export type TransformerConfig = z.infer<typeof TransformerConfigSchema>;

export const VisionConfigSchema = z.object({
  model_id: z.string().default(""),
  image_source: z.enum(["url", "base64", "input"]).default("url"),
  analysis_prompt: z.string().default(""),
});
export type VisionConfig = z.infer<typeof VisionConfigSchema>;

export const NODE_TYPE_IDS = [
  "trigger", "llm", "tool", "condition", "switch",
  "output_guard", "stt", "tts", "rag_search", "memory",
  "hitl", "loop", "sub_flow", "delay", "error_handler",
  "transformer", "vision",
] as const;
export type NodeTypeId = (typeof NODE_TYPE_IDS)[number];

export function getConfigSchema(type: string): z.ZodTypeAny {
  const map: Record<string, z.ZodTypeAny> = {
    trigger: TriggerConfigSchema, llm: LLMConfigSchema, tool: ToolConfigSchema,
    condition: ConditionConfigSchema, switch: SwitchConfigSchema,
    output_guard: OutputGuardConfigSchema, stt: STTConfigSchema, tts: TTSConfigSchema,
    rag_search: RAGSearchConfigSchema, memory: MemoryConfigSchema, hitl: HITLConfigSchema,
    loop: LoopConfigSchema, sub_flow: SubFlowConfigSchema, delay: DelayConfigSchema,
    error_handler: ErrorHandlerConfigSchema, transformer: TransformerConfigSchema,
    vision: VisionConfigSchema,
  };
  return map[type] ?? z.record(z.unknown());
}

export function validateNodeConfig(type: string, data: unknown) {
  return getConfigSchema(type).safeParse(data);
}
