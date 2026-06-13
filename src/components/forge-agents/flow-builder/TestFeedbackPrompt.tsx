/**
 * TestFeedbackPrompt — Phase 9: After 5+ test messages, prompt for quality feedback
 */
import { useState } from "react";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  executionIds: string[];
  onDismiss: () => void;
}

export function TestFeedbackPrompt({ executionIds, onDismiss }: Props) {
  const [submitted, setSubmitted] = useState(false);

  const submitFeedback = async (positive: boolean) => {
    setSubmitted(true);
    // Save feedback to the latest execution
    const latestId = executionIds[executionIds.length - 1];
    if (latestId) {
      await (supabase as any)
        .from("agent_executions")
        .update({ quality_feedback: positive ? "positive" : "negative" })
        .eq("id", latestId);
    }
    setTimeout(onDismiss, 1500);
  };

  if (submitted) {
    return (
      <div className="mx-3 mb-2 rounded-lg p-2.5 text-center text-[11px] border border-border bg-muted/50" style={{ color: "var(--ps-cream-60, hsl(var(--muted-foreground)))" }}>
        Obrigado pelo feedback! 🙏
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 rounded-lg p-2.5 border border-border bg-muted/30 flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">
        Como está a qualidade das respostas?
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => submitFeedback(true)}
          className="p-1.5 rounded-md hover:bg-primary/10 transition-colors"
          title="Boa qualidade"
        >
          <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
        </button>
        <button
          onClick={() => submitFeedback(false)}
          className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
          title="Precisa melhorar"
        >
          <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
