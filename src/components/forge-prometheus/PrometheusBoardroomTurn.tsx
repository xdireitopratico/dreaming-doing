/**
 * PrometheusBoardroomTurn — Single message in the streaming feed
 * Session summaries render as collapsible cards
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, FileText } from "lucide-react";
import type { BoardroomMessage } from "./PrometheusBoardroom";

interface Props {
  message: BoardroomMessage;
  agent: { id: string; name: string; icon: string; color: string; role: string };
  typeLabel: { label: string; color: string };
}

export function PrometheusBoardroomTurn({ message, agent, typeLabel }: Props) {
  const isSessionSummary = (message.metadata as Record<string, unknown>)?.type === "session_summary";

  if (isSessionSummary) {
    return <SessionSummaryCard message={message} agent={agent} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex gap-3"
    >
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[14px]"
        style={{
          background: `${agent.color.replace(")", " / 0.1)")}`,
          border: `1px solid ${agent.color.replace(")", " / 0.25)")}`,
        }}
      >
        {agent.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold" style={{ color: agent.color }}>
            {agent.name}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{
              background: `${typeLabel.color.replace(")", " / 0.1)")}`,
              color: typeLabel.color,
              border: `1px solid ${typeLabel.color.replace(")", " / 0.2)")}`,
            }}
          >
            {typeLabel.label}
          </span>
          <span className="text-[8px]" style={{ color: "var(--ps-cream-25)" }}>
            {message.phase}
          </span>
        </div>
        <div className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--ps-cream-60)" }}>
          {message.content}
        </div>
      </div>
    </motion.div>
  );
}

/** Collapsible card for session summary */
function SessionSummaryCard({
  message,
  agent,
}: {
  message: BoardroomMessage;
  agent: { id: string; name: string; icon: string; color: string; role: string };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="rounded-xl overflow-hidden cursor-pointer select-none"
      style={{
        background: "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(139,92,246,0.06) 100%)",
        border: "1px solid rgba(59,130,246,0.2)",
      }}
      onClick={() => setExpanded((p) => !p)}
    >
      {/* Header — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.25)",
          }}
        >
          <FileText className="w-4 h-4" style={{ color: "hsl(210 100% 60%)" }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: "var(--ps-cream-80)" }}>
              Resumo da Sessão
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(59,130,246,0.12)",
                color: "hsl(210 100% 65%)",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              {agent.name}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--ps-cream-30)" }}>
            Sessão salva automaticamente • Toque para {expanded ? "recolher" : "expandir"}
          </span>
        </div>

        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown className="w-4 h-4" style={{ color: "var(--ps-cream-40)" }} />
        </motion.div>
      </div>

      {/* Content — collapsible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-1 text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{
                color: "var(--ps-cream-60)",
                borderTop: "1px solid rgba(59,130,246,0.1)",
              }}
            >
              {message.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
