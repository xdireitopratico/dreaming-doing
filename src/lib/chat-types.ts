import type { StoredMessagePart } from "@/lib/chat-attachments";

export type AgentComposerMode = "plan" | "build";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ name: string; args: string }>;
  meta?: Record<string, unknown> | null;
  parts?: StoredMessagePart[];
  runId?: string;
  timestamp: number;
}