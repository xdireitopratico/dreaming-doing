/**
 * Shared types for FlowBuilder sub-components
 */

export type PanelType =
  | null
  | "test" | "deploy" | "logs" | "eval" | "tools" | "validation"
  | "rag" | "templates" | "hooks" | "versions" | "analytics"
  | "team" | "schedules" | "market" | "secrets" | "notifications"
  | "debug" | "comments" | "exportimport" | "language" | "hitl" | "dlq"
  | "privacy" | "apidocs" | "physician" | "codex" | "openapi-import";
