/**
 * PrometheusPhaseTransition — Transição cinematográfica entre fases
 * Adapted from PhaseTransition.tsx with Deep Blue theme
 */
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

interface Props {
  phaseKey: string;
  children: ReactNode;
  phaseLabel?: string;
}

export function PrometheusPhaseTransition({ phaseKey, children, phaseLabel }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phaseKey}
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.25, ease: "easeOut" }}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { x: "-100%" }}
          animate={reduceMotion ? { opacity: [0, 0.2, 0] } : { x: "100%" }}
          transition={{ duration: reduceMotion ? 0.2 : 0.35, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(59,130,246,0.15), transparent)",
            pointerEvents: "none",
            zIndex: 50,
          }}
        />

        {phaseLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: reduceMotion ? 0.45 : 0.75, times: [0, 0.2, 0.75, 1] }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 51,
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                fontFamily: "'Georgia', serif",
                fontStyle: "italic",
                fontSize: "1.25rem",
                color: "var(--ps-accent)",
                textShadow: "0 0 24px var(--ps-accent-glow)",
                letterSpacing: "0.1em",
              }}
            >
              {phaseLabel}
            </span>
          </motion.div>
        )}

        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
