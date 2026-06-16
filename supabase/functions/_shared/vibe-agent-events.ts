// ============================================================================
// VIBE AGENT EVENTS — Contrato compartilhado Client ↔ Edge Function (Deno)
// ============================================================================

export type ChatEvent =
  | { type: 'chat_intro'; text: string; timestamp: number; requestId: string }
  | { type: 'chat_loop_step'; 
      stepId: string; 
      label: string; 
      status: 'pending' | 'running' | 'done' | 'error';
      metadata?: Record<string, unknown>;
      timestamp: number; 
      requestId: string }
  | { type: 'chat_plan_approved';
      planId: string;
      title: string;
      tasks: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; dependsOn?: string[] }>;
      timestamp: number; 
      requestId: string }
  | { type: 'chat_task_update';
      planId: string;
      taskId: string;
      status: 'running' | 'done' | 'error';
      output?: string;
      timestamp: number; 
      requestId: string }
  | { type: 'chat_closure';
      summary: string;
      remaining: string[];
      nextSteps: string[];
      artifacts?: Array<{ type: 'flow_version' | 'file' | 'link'; id: string; label: string }>;
      timestamp: number; 
      requestId: string }
  | { type: 'chat_error'; 
      code: string; 
      message: string; 
      recoverable: boolean; 
      suggestion?: string;
      timestamp: number; 
      requestId: string }
  | { type: 'checkpoint'; 
      cursor: string; 
      eventsSoFar: number; 
      timestamp: number; 
      requestId: string };

export type InspectorEvent =
  | { type: 'thinking'; content: string; timestamp: number; requestId: string; sequence: number }
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
  | { type: 'reasoning'; content: string; timestamp: number; requestId: string; sequence: number }
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
  | { type: 'checkpoint'; 
      cursor: string; 
      eventsSoFar: number; 
      timestamp: number; 
      requestId: string };