/**
 * PrometheusLoadingSkeleton — Animated skeleton for lazy-loaded phases
 * Replaces generic spinner with contextual loading UI
 */
import { motion } from "framer-motion";
import "./prometheus-studio.css";

export function PrometheusLoadingSkeleton() {
  return (
    <div className="prometheus-studio flex flex-col items-center justify-center h-full gap-6 px-6">
      {/* Pulsing icon */}
      <motion.div
        initial={{ opacity: 0.3, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.2, ease: "easeInOut" }}
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))",
          border: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        <div
          className="w-5 h-5 rounded-full animate-spin"
          style={{
            border: "2px solid var(--ps-accent-dim)",
            borderTopColor: "var(--ps-accent)",
          }}
        />
      </motion.div>

      {/* Skeleton bars */}
      <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
        <div className="h-3 rounded-full w-3/4 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-2.5 rounded-full w-1/2 animate-pulse" style={{ background: "rgba(255,255,255,0.04)", animationDelay: "150ms" }} />
        <div className="h-2 rounded-full w-2/5 animate-pulse" style={{ background: "rgba(255,255,255,0.03)", animationDelay: "300ms" }} />
      </div>

      <span className="text-[10px] tracking-widest uppercase" style={{ color: "var(--ps-cream-25)" }}>
        Carregando módulo...
      </span>
    </div>
  );
}
