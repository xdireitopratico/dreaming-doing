/**
 * PrometheusBoardroomAgent — Agent avatar in the council
 */
import { motion } from "framer-motion";

interface Props {
  agent: { id: string; name: string; icon: string; color: string; role: string };
  isActive: boolean;
  hasSpoken: boolean;
  isStreaming: boolean;
}

export function PrometheusBoardroomAgent({ agent, isActive, hasSpoken, isStreaming }: Props) {
  return (
    <motion.div
      animate={isActive ? { scale: 1.08 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="flex flex-col items-center gap-1.5"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-[20px] relative transition-all duration-300"
        style={{
          background: isActive ? `${agent.color.replace(")", " / 0.12)")}` : "rgba(255,255,255,0.04)",
          border: `2px solid ${isActive ? agent.color : hasSpoken ? agent.color.replace(")", " / 0.4)") : "rgba(255,255,255,0.08)"}`,
          boxShadow: isActive ? `0 0 20px ${agent.color.replace(")", " / 0.2)")}` : "none",
        }}
      >
        {agent.icon}
        {isActive && isStreaming && (
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full animate-pulse"
            style={{ background: agent.color, border: "2px solid var(--ps-bg-deep)" }}
          />
        )}
      </div>
      <div
        className="text-[10px] font-medium text-center whitespace-nowrap"
        style={{ color: isActive ? agent.color : "var(--ps-cream-40)" }}
      >
        {agent.name}
      </div>
      <div
        className="text-[8px] text-center"
        style={{ color: "var(--ps-cream-25)" }}
      >
        {agent.role}
      </div>
    </motion.div>
  );
}
