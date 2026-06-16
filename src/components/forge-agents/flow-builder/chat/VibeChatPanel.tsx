import { MinicardLooping } from './MinicardLooping';
import { AtomicPlanChecklist } from './AtomicPlanChecklist';
import { ClosureCard } from './ClosureCard';

interface VibeChatPanelProps {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    meta?: {
      kind: 'intro' | 'loop_step' | 'plan' | 'task' | 'closure' | 'error';
      minicard?: {
        id: string;
        title: string;
        steps: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error' }>;
        startedAt: number;
      };
      closure?: {
        summary: string;
        remaining: string[];
        nextSteps: string[];
        artifacts: Array<{ type: 'flow_version' | 'file' | 'link'; id: string; label: string }>;
      };
    };
  }>;
  currentMinicard: {
    id: string;
    title: string;
    steps: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error' }>;
    startedAt: number;
  } | null;
  currentPlan: {
    id: string;
    title: string;
    tasks: Array<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; dependsOn?: string[] }>;
    createdAt: number;
  } | null;
}

export function VibeChatPanel({ messages, currentMinicard, currentPlan }: VibeChatPanelProps) {
  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`rounded-lg p-3 ${
            msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

          {msg.meta?.kind === 'closure' && msg.meta.closure ? (
            <div className="mt-3">
              <ClosureCard closure={msg.meta.closure} />
            </div>
          ) : null}
        </div>
      ))}

      {currentMinicard ? (
        <div className="mt-3">
          <MinicardLooping minicard={currentMinicard} />
        </div>
      ) : null}

      {currentPlan ? (
        <div className="mt-3">
          <AtomicPlanChecklist plan={currentPlan} />
        </div>
      ) : null}
    </div>
  );
}