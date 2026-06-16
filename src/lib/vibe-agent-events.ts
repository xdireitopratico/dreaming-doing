// ============================================================================
// VIBE AGENT EVENTS — Contrato compartilhado Client ↔ Edge Function
// ============================================================================

import type { Node, Edge } from '@xyflow/react';

// ============================================================================
// CHAT EVENTS — Canal curado para o usuário final
// ============================================================================

export type ChatEvent =
  // 1. Intro — sempre primeiro, 1 parágrafo contextual
  | { type: 'chat_intro'; text: string; timestamp: number; requestId: string }
  
  // 2. Looping/Exploração — minicard progressivo (ordem dinâmica por execução)
  | { type: 'chat_loop_step'; 
      stepId: string; 
      label: string; 
      status: 'pending' | 'running' | 'done' | 'error';
      metadata?: Record<string, unknown>;
      timestamp: number; 
      requestId: string }
  
  // 3. Plano Aprovado → Lista Atômica (checkboxes com dependências)
  | { type: 'chat_plan_approved';
      planId: string;
      title: string;
      tasks: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; dependsOn?: string[]; output?: string }>;
      timestamp: number; 
      requestId: string }
  | { type: 'chat_task_update';
      planId: string;
      taskId: string;
      status: 'running' | 'done' | 'error';
      output?: string;
      timestamp: number; 
      requestId: string }
  
  // 4. Fechamento — sempre último
  | { type: 'chat_closure';
      summary: string;
      remaining: string[];
      nextSteps: string[];
      artifacts?: Array<{ type: 'flow_version' | 'file' | 'link'; id: string; label: string }>;
      timestamp: number; 
      requestId: string }
  
  // Erro recuperável no chat
  | { type: 'chat_error'; 
      code: string; 
      message: string; 
      recoverable: boolean; 
      suggestion?: string;
      timestamp: number; 
      requestId: string }
  
  // Checkpoint para replay/reconexão
  | { type: 'checkpoint'; 
      cursor: string; 
      eventsSoFar: number; 
      timestamp: number; 
      requestId: string };

// ============================================================================
// INSPECTOR EVENTS — Consumo completo para debug/auditoria
// ============================================================================

export type InspectorEvent =
  // Thinking bruto do LLM (stream de tokens ou parágrafos completos)
  | { type: 'thinking'; content: string; timestamp: number; requestId: string; sequence: number }
  
  // Tool calls completas
  | { type: 'tool_call';
      callId: string;
      tool: 'read' | 'search' | 'edit' | 'bash' | 'grep' | 'list' | 'patch' | 'llm_call' | 'db_query' | 'web_search' | 'reasoning';
      input: Record<string, unknown>;
      output?: Record<string, unknown>;
      status: 'start' | 'complete' | 'error';
      durationMs?: number;
      error?: string;
      timestamp: number; 
      requestId: string; 
      sequence: number }
  
  // Reasoning interno (separado do thinking para filtragem)
  | { type: 'reasoning'; content: string; timestamp: number; requestId: string; sequence: number }
  
  // Estado da sessão
  | { type: 'session_start'; 
      sessionId: string; 
      requestId: string; 
      prompt: string; 
      model: string; 
      provider: string;
      timestamp: number; 
      sequence: number }
  | { type: 'session_end'; 
      sessionId: string; 
      requestId: string; 
      outcome: 'success' | 'partial' | 'failed' | 'cancelled';
      totalDurationMs: number;
      totalTokens: { input: number; output: number };
      timestamp: number; 
      sequence: number }
  
  // Checkpoint para replay/reconexão
  | { type: 'checkpoint'; 
      cursor: string; 
      eventsSoFar: number; 
      timestamp: number; 
      requestId: string };

// ============================================================================
// DOMAIN TYPES
// ============================================================================

export interface FlowPatch {
  nodes: Node[];
  edges: Edge[];
  changed_node_ids?: string[];
  description?: string;
}

export interface FlowVersion {
  id: string;
  conversation_id: string;
  patch: FlowPatch;
  applied_at: string;
  applied_by: 'user' | 'agent';
  parent_version_id?: string;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  flow_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuratedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  meta?: {
    kind: 'intro' | 'loop_step' | 'plan' | 'task' | 'closure' | 'error';
    minicard?: MinicardState;
    plan?: AtomicPlan;
    closure?: ClosureData;
  };
}

export interface MinicardState {
  id: string;
  title: string;
  steps: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error' }>;
  startedAt: number;
}

export interface AtomicPlan {
  id: string;
  title: string;
  tasks: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; dependsOn?: string[]; output?: string }>;
  createdAt: number;
}

export interface ClosureData {
  summary: string;
  remaining: string[];
  nextSteps: string[];
  artifacts: Array<{ type: 'flow_version' | 'file' | 'link'; id: string; label: string }>;
}

// ============================================================================
// TYPE GUARDS (para narrow typing em switch)
// ============================================================================

export function isChatIntro(e: ChatEvent): e is Extract<ChatEvent, { type: 'chat_intro' }> {
  return e.type === 'chat_intro';
}

export function isChatLoopStep(e: ChatEvent): e is Extract<ChatEvent, { type: 'chat_loop_step' }> {
  return e.type === 'chat_loop_step';
}

export function isChatPlanApproved(e: ChatEvent): e is Extract<ChatEvent, { type: 'chat_plan_approved' }> {
  return e.type === 'chat_plan_approved';
}

export function isChatTaskUpdate(e: ChatEvent): e is Extract<ChatEvent, { type: 'chat_task_update' }> {
  return e.type === 'chat_task_update';
}

export function isChatClosure(e: ChatEvent): e is Extract<ChatEvent, { type: 'chat_closure' }> {
  return e.type === 'chat_closure';
}

export function isChatError(e: ChatEvent): e is Extract<ChatEvent, { type: 'chat_error' }> {
  return e.type === 'chat_error';
}

export function isCheckpoint(e: ChatEvent | InspectorEvent): e is Extract<ChatEvent | InspectorEvent, { type: 'checkpoint' }> {
  return e.type === 'checkpoint';
}

export function isThinking(e: InspectorEvent): e is Extract<InspectorEvent, { type: 'thinking' }> {
  return e.type === 'thinking';
}

export function isToolCall(e: InspectorEvent): e is Extract<InspectorEvent, { type: 'tool_call' }> {
  return e.type === 'tool_call';
}

export function isReasoning(e: InspectorEvent): e is Extract<InspectorEvent, { type: 'reasoning' }> {
  return e.type === 'reasoning';
}

export function isSessionStart(e: InspectorEvent): e is Extract<InspectorEvent, { type: 'session_start' }> {
  return e.type === 'session_start';
}

export function isSessionEnd(e: InspectorEvent): e is Extract<InspectorEvent, { type: 'session_end' }> {
  return e.type === 'session_end';
}

// ============================================================================
// UTILITIES
// ============================================================================

/** Gera cursor opaco para replay (base64 de JSON { requestId, sequence, timestamp }) */
export function createCursor(requestId: string, sequence: number, timestamp: number): string {
  return btoa(JSON.stringify({ requestId, sequence, timestamp }));
}

/** Parse cursor opaco */
export function parseCursor(cursor: string): { requestId: string; sequence: number; timestamp: number } | null {
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
}

/** Topological sort para tasks com dependsOn */
export function topologicalSort<T extends { id: string; dependsOn?: string[] }>(tasks: T[]): T[] {
  const map = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const result: T[] = [];
  
  function visit(id: string) {
    if (visited.has(id)) return;
    const task = map.get(id);
    if (!task) return;
    task.dependsOn?.forEach(visit);
    visited.add(id);
    result.push(task);
  }
  
  tasks.forEach(t => visit(t.id));
  return result;
}