export interface LibraryEntry {
  id: string;
  name: string;
  source_url: string;
  ingest_kind: "production" | "curated" | "smoke" | "manual";
  category: string;
  quality_score: number;
  quality_source: string;
  validated: boolean;
  raw_markdown: string | null;
  clean_markdown: string | null;
  raw_html: string | null;
  clean_html: string | null;
  content_hygiene: Record<string, unknown> | null;
  screenshot_url: string | null;
  screenshot_base64?: string | null;
  provider_trace: string[] | null;
  confidence: number | null;
  blocked_reason: string | null;
  design_dna: DesignDna | null;
  serves_domains: string[];
  compatible_languages: string[];
  compatible_moods: string[];
  tags: string[];
  notes: string | null;
  is_archived: boolean;
  view_count: number;
  extracted_at: string;
  created_at: string;
}

export interface DesignDna {
  layout?: Record<string, unknown> | null;
  color?: Record<string, unknown> | null;
  typography?: Record<string, unknown> | null;
  motion?: Record<string, unknown> | null;
  interaction?: Record<string, unknown> | null;
  component?: Record<string, unknown> | null;
  implementation_notes?: string | null;
}

export interface DesignDnaJob {
  id: string;
  user_id: string | null;
  status: "pending" | "running" | "partial" | "blocked" | "completed" | "failed" | "canceled";
  depth: "shallow" | "deep";
  categories: string[];
  urls: string[];
  current_url_index: number;
  results: Record<string, unknown>[];
  errors: Record<string, unknown>[];
  sandbox_id: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  meta: {
    previewUrl?: string;
    current_url_index?: number;
    urls_completed?: number;
  };
}

export interface LibraryFilters {
  domain: string;
  mood: string;
  language: string;
  category: string;
  ingestKind: "all" | "production" | "curated" | "smoke" | "manual";
  minQuality: number;
  validatedOnly: boolean;
  search: string;
}

export interface LibraryOverview {
  total_rows: number;
  production_rows: number;
  curated_rows: number;
  smoke_rows: number;
  manual_rows: number;
  archived_rows: number;
  distinct_source_urls: number;
  duplicate_groups: number;
  duplicate_rows: number;
}

export interface RealtimeEvent {
  id: string;
  job_id: string;
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DesignDnaInstruction {
  id: string;
  job_id: string;
  role: "user" | "system";
  content: string;
  status: "pending" | "consumed" | "canceled";
  created_at: string;
  consumed_at?: string | null;
}

export type AgentEventType =
  | "agent_thought"
  | "agent_action"
  | "agent_observation"
  | "agent_instruction_consumed"
  | "agent_done"
  | "agent_error";

export const CATEGORIES = [
  "all",
  "hero",
  "motion",
  "typography",
  "color_application",
  "components",
  "interactions",
  "full_page",
] as const;

export const INGEST_KINDS = [
  "all",
  "production",
  "curated",
  "smoke",
  "manual",
] as const;

export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  running: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  blocked: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  completed: "bg-green-500/10 text-green-500 border-green-500/30",
  failed: "bg-red-500/10 text-red-500 border-red-500/30",
  canceled: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export const JOB_TERMINAL_STATUSES = [
  "partial",
  "blocked",
  "completed",
  "failed",
  "canceled",
] as const;

export function getQualityColor(score: number): string {
  if (score <= 3) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (score <= 6) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  if (score <= 8) return "bg-green-500/15 text-green-400 border-green-500/30";
  return "bg-amber-400/15 text-amber-400 border-amber-400/30";
}

export const DEFAULT_FILTERS: LibraryFilters = {
  domain: "",
  mood: "",
  language: "",
  category: "all",
  ingestKind: "production",
  minQuality: 0,
  validatedOnly: false,
  search: "",
};
