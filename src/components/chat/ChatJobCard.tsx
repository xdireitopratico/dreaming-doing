import type { MiniCardData } from "@/lib-v2/chat-types";
import { ChatTaskList } from "./ChatTaskList";

type ChatJobCardProps = {
  data: MiniCardData;
  runId: string;
  isFocused?: boolean;
  onClick?: () => void;
};

export function ChatJobCard({ data, isFocused, onClick }: ChatJobCardProps) {
  const statusBadge = () => {
    if (data.planReady) return <span className="forge-mini-card-badge">Plan ready</span>;
    if (data.status === "done")
      return <span className="forge-mini-card-badge forge-mini-card-badge--done">Done</span>;
    if (data.status === "failed")
      return <span className="forge-mini-card-badge forge-mini-card-badge--failed">Failed</span>;
    return <span className="forge-mini-card-badge">Working...</span>;
  };

  const statusDot = () => {
    if (data.status === "done") return "forge-mini-card-dot--done";
    if (data.status === "failed") return "forge-mini-card-dot--failed";
    return "forge-mini-card-dot--active";
  };

  const hint = () => {
    if (data.planReady) return "Revisar plano no inspector →";
    if (data.status === "done" && data.fileCount) return `${data.fileCount} arquivos alterados →`;
    if (data.hasPlan) return "Ver plano no inspector →";
    return "Detalhes completos →";
  };

  const subtitle =
    data.liveBriefings.length > 0
      ? data.liveBriefings[data.currentTaskIndex % data.liveBriefings.length]
      : data.title;

  return (
    <button
      type="button"
      className={`forge-mini-card ${isFocused ? "forge-mini-card--focused" : ""}`}
      onClick={onClick}
    >
      <div className="forge-mini-card-header">
        <span className={`forge-mini-card-dot ${statusDot()}`} aria-hidden />
        {statusBadge()}
      </div>
      {data.editedFile && <p className="forge-mini-card-header-line">{data.editedFile}</p>}
      <p className="forge-mini-card-title">{subtitle}</p>
      {data.tasks.length > 0 && <ChatTaskList tasks={data.tasks} />}
      <p className="forge-mini-card-hint">{hint()}</p>
    </button>
  );
}
