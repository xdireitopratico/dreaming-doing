import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ListTodo,
  Loader2,
  Send,
  SkipForward,
  Square,
} from "lucide-react";
import type { ClarifyChoice, ClarifyPrompt, ClarifyQuestion } from "@/lib/chat/types";

export type ClarifyAnswer = {
  questionId: string;
  /** Single-choice answer. */
  choiceId?: string;
  /** Multi-choice answer. */
  choiceIds?: string[];
  text?: string;
  /** Enriched payload for the consumer to format the final message. */
  question?: string;
  choice?: ClarifyChoice;
  choices?: ClarifyChoice[];
};

export type ChatClarifyDockProps = {
  /** Dados do clarify parseado. Null = nada a mostrar. */
  data: ClarifyPrompt | null;
  /** True quando o agente ainda está pensando/criando o clarify. */
  creating?: boolean;
  disabled?: boolean;
  onSubmit?: (answers: ClarifyAnswer[]) => void;
  onSkip?: () => void;
};

function normalizeQuestions(data: ClarifyPrompt): ClarifyQuestion[] {
  if (data.questions && data.questions.length > 0) {
    return data.questions;
  }
  return [
    {
      id: "q1",
      intro: data.intro,
      question: data.question ?? "",
      choices: data.choices ?? [],
    },
  ];
}

function formatChoiceReply(choice: ClarifyChoice): string {
  return `${choice.label}${choice.description ? ` — ${choice.description}` : ""}`;
}

function formatChoicesReply(choices: ClarifyChoice[]): string {
  return choices.map(formatChoiceReply).join("; ");
}

function getAnswerDisplay(answer: ClarifyAnswer | undefined, question: ClarifyQuestion): string {
  if (!answer) return "Não respondida";
  const multi = question.multiple;
  if (multi) {
    if (answer.choiceIds && answer.choiceIds.length > 0) {
      const choices = question.choices.filter((c) => answer.choiceIds?.includes(c.id));
      if (choices.length > 0) return formatChoicesReply(choices);
    }
  } else if (answer.choiceId) {
    const choice = question.choices.find((c) => c.id === answer.choiceId);
    if (choice) return formatChoiceReply(choice);
  }
  if (answer.text?.trim()) return answer.text.trim();
  return "Não respondida";
}

function isAnswered(answer: ClarifyAnswer | undefined, multiple?: boolean): boolean {
  if (!answer) return false;
  if (multiple) return !!answer.choiceIds && answer.choiceIds.length > 0;
  return !!(answer.choiceId || answer.text?.trim());
}

export function ChatClarifyDock({
  data,
  creating,
  disabled,
  onSubmit,
  onSkip,
}: ChatClarifyDockProps) {
  const questions = useMemo(() => (data ? normalizeQuestions(data) : []), [data]);
  const total = questions.length;
  const multi = total > 1;

  const [answers, setAnswers] = useState<Record<string, ClarifyAnswer>>({});
  const [step, setStep] = useState<number>(0); // 0..total-1 = questions, total = review
  const [busy, setBusy] = useState(false);

  const questionIds = useMemo(
    () => data?.questions?.map((q) => q.id).join(",") ?? "",
    [data?.questions],
  );

  // Reset state when questions change (new clarify session)
  useEffect(() => {
    setAnswers({});
    setStep(0);
  }, [data?.question, data?.intro, questionIds]);

  const isReview = step >= total;
  const currentQuestion = isReview ? null : questions[step];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const hasUnanswered = questions.some((q) => !isAnswered(answers[q.id], q.multiple));

  const setAnswer = useCallback((questionId: string, patch: Partial<ClarifyAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? { questionId }), questionId, ...patch },
    }));
  }, []);

  const handleSelectChoice = (choice: ClarifyChoice) => {
    if (!currentQuestion || disabled || busy) return;
    const multiple = currentQuestion.multiple;
    if (multi || multiple) {
      if (multiple) {
        // Toggle multi-select
        const currentIds = currentAnswer?.choiceIds ?? [];
        const selected = currentIds.includes(choice.id);
        const nextIds = selected
          ? currentIds.filter((id) => id !== choice.id)
          : [...currentIds, choice.id];
        const selectedChoices = currentQuestion.choices.filter((c) => nextIds.includes(c.id));
        setAnswer(currentQuestion.id, {
          question: currentQuestion.question,
          choices: selectedChoices,
          choiceIds: nextIds,
          choice: undefined,
          choiceId: undefined,
          text: undefined,
        });
      } else {
        // Single choice in multi-question wizard
        setAnswer(currentQuestion.id, {
          question: currentQuestion.question,
          choice,
          choiceId: choice.id,
          choiceIds: undefined,
          text: undefined,
        });
      }
    } else {
      setBusy(true);
      onSubmit?.([
        {
          question: currentQuestion.question,
          choice,
          choiceId: choice.id,
          questionId: currentQuestion.id,
        },
      ]);
    }
  };

  const handleCustomReply = () => {
    if (!currentQuestion || disabled || busy || !onSubmit) return;
    const text = currentAnswer?.text?.trim();
    if (!text) return;
    if (multi) {
      setAnswer(currentQuestion.id, {
        question: currentQuestion.question,
        text,
        choice: undefined,
        choices: undefined,
        choiceId: undefined,
        choiceIds: undefined,
      });
    } else {
      setBusy(true);
      onSubmit?.([{ question: currentQuestion.question, text, questionId: currentQuestion.id }]);
    }
  };

  const handleNext = () => {
    if (step < total - 1) setStep((s) => s + 1);
    else if (step === total - 1) setStep(total); // go to review
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleReviewSubmit = () => {
    if (disabled || busy || hasUnanswered || !onSubmit) return;
    setBusy(true);
    const payload = questions.map((q) => answers[q.id] ?? { questionId: q.id });
    onSubmit(payload);
  };

  const handleSkip = () => {
    if (disabled || busy) return;
    setBusy(true);
    onSkip?.();
  };

  if (creating && !data) {
    return (
      <div className="forge-clarify-dock" data-testid="chat-clarify-dock-creating">
        <div className="forge-clarify-dock-shell forge-clarify-dock-shell--skeleton">
          <div className="forge-clarify-shimmer-lines" aria-hidden>
            <div className="forge-clarify-shimmer-line" style={{ width: "40%" }} />
            <div className="forge-clarify-shimmer-line" style={{ width: "72%" }} />
            <div className="forge-clarify-shimmer-line" style={{ width: "55%" }} />
            <div className="forge-clarify-shimmer-line" style={{ width: "35%" }} />
          </div>
          <p className="forge-clarify-skeleton-label">Analyzing...</p>
        </div>
      </div>
    );
  }

  if (!data || questions.length === 0) return null;

  return (
    <div className="forge-clarify-dock" data-testid="chat-clarify-dock">
      <div className="forge-clarify-dock-shell">
        {/* Header */}
        <div className="forge-clarify-header">
          <p className="forge-clarify-label">
            <HelpCircle className="size-3" aria-hidden />
            {isReview ? "Revisar respostas" : "Clarify"}
            {multi && !isReview && (
              <span className="forge-clarify-count">
                · {step + 1} of {total}
              </span>
            )}
            {multi && isReview && <span className="forge-clarify-count">· {total} perguntas</span>}
          </p>
        </div>

        {/* Review step */}
        {isReview ? (
          <div className="forge-clarify-review">
            <p className="forge-clarify-review-hint">
              Revise suas respostas antes de enviar. Você ainda pode voltar e editar.
            </p>
            <ul className="forge-clarify-review-list">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                return (
                  <li key={q.id} className="forge-clarify-review-item">
                    <button
                      type="button"
                      className="forge-clarify-review-edit"
                      disabled={disabled || busy}
                      onClick={() => setStep(idx)}
                    >
                      <span className="forge-clarify-review-index">{idx + 1}</span>
                      <span className="forge-clarify-review-text">
                        <span className="forge-clarify-review-question">{q.question}</span>
                        {q.multiple && (
                          <span className="forge-clarify-review-hint">Várias respostas permitidas</span>
                        )}
                        <span className="forge-clarify-review-answer">
                          {ans ? getAnswerDisplay(ans, q) : "Não respondida"}
                        </span>
                      </span>
                      <span className="forge-clarify-review-chevron">
                        <ChevronRight className="size-4" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <>
            {/* Question body */}
            <div className="forge-clarify-body">
              {currentQuestion?.intro && (
                <p className="forge-clarify-intro">{currentQuestion.intro}</p>
              )}
              <p className="forge-clarify-question">{currentQuestion?.question}</p>
              {currentQuestion?.multiple && (
                <p className="forge-clarify-hint">Selecione uma ou mais opções</p>
              )}
            </div>

            {/* Choices */}
            {currentQuestion && currentQuestion.choices.length > 0 && (
              <ul className="forge-clarify-choices">
                {currentQuestion.choices.map((choice, i) => {
                  const multiple = currentQuestion.multiple;
                  const selected = multiple
                    ? (currentAnswer?.choiceIds ?? []).includes(choice.id)
                    : currentAnswer?.choiceId === choice.id;
                  return (
                    <li key={choice.id}>
                      <button
                        type="button"
                        className={`forge-clarify-choice${
                          selected ? " forge-clarify-choice--selected" : ""
                        }${disabled || busy ? " forge-clarify-choice--disabled" : ""}`}
                        disabled={disabled || busy}
                        onClick={() => handleSelectChoice(choice)}
                      >
                        <span className="forge-clarify-choice-letter" aria-hidden>
                          {multiple ? (
                            selected ? (
                              <Check className="size-3" />
                            ) : (
                              <Square className="size-3" />
                            )
                          ) : selected ? (
                            <Check className="size-3" />
                          ) : (
                            String.fromCharCode(65 + i)
                          )}
                        </span>
                        <span className="forge-clarify-choice-content">
                          <span className="forge-clarify-choice-label">{choice.label}</span>
                          {choice.description && (
                            <span className="forge-clarify-choice-desc">{choice.description}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Custom input */}
            <div className="forge-clarify-input-row">
              <input
                type="text"
                className="forge-clarify-input"
                placeholder={
                  currentQuestion && currentQuestion.choices.length > 0
                    ? "Ou digite sua própria resposta..."
                    : "Descreva ou cole uma URL..."
                }
                value={currentAnswer?.text ?? ""}
                disabled={disabled || busy}
                onChange={(e) =>
                  currentQuestion &&
                  setAnswer(currentQuestion.id, {
                    text: e.target.value,
                    choiceId: undefined,
                    choiceIds: undefined,
                    choice: undefined,
                    choices: undefined,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (multi) {
                      if (currentAnswer?.text?.trim()) handleNext();
                    } else {
                      handleCustomReply();
                    }
                  }
                }}
              />
            </div>
          </>
        )}

        {/* Actions row */}
        <div className="forge-composer-row">
          <div className="forge-composer-row-start">
            {multi && !isReview && step > 0 && (
              <button
                type="button"
                className="forge-clarify-btn"
                disabled={disabled || busy}
                onClick={handlePrev}
              >
                <ChevronLeft className="size-3.5" />
                Anterior
              </button>
            )}
            <button
              type="button"
              className="forge-clarify-btn"
              disabled={disabled || busy}
              onClick={handleSkip}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SkipForward className="size-3.5" />
              )}
              Skip
            </button>
          </div>

          <div className="forge-composer-spacer" aria-hidden />

          <div className="forge-composer-row-end">
            {isReview ? (
              <>
                <button
                  type="button"
                  className="forge-clarify-btn"
                  disabled={disabled || busy}
                  onClick={handlePrev}
                >
                  <ChevronLeft className="size-3.5" />
                  Voltar
                </button>
                <button
                  type="button"
                  className="forge-clarify-btn forge-clarify-btn--approve"
                  disabled={disabled || busy || hasUnanswered}
                  onClick={handleReviewSubmit}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Enviar respostas
                </button>
              </>
            ) : multi ? (
              <button
                type="button"
                className="forge-clarify-btn forge-clarify-btn--approve"
                disabled={disabled || busy}
                onClick={handleNext}
              >
                {step === total - 1 ? (
                  <>
                    <ListTodo className="size-3.5" />
                    Revisar
                  </>
                ) : (
                  <>
                    Próxima
                    <ChevronRight className="size-3.5" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="forge-clarify-btn forge-clarify-btn--approve"
                disabled={disabled || busy || !currentAnswer?.text?.trim()}
                onClick={handleCustomReply}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
