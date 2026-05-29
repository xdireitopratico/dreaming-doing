import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Headline cinética — cada palavra entra com física Disney (queda + bounce).
 * Use <KineticHeadline> com children = string ou <Word>.
 */
export function KineticHeadline({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <h1 className={className}>
      <KineticGroup delay={delay}>{children}</KineticGroup>
    </h1>
  );
}

export function KineticGroup({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  // children can be string or mixed
  if (typeof children === "string") {
    const words = children.split(/(\s+)/);
    let wIdx = 0;
    return (
      <>
        {words.map((w, i) => {
          if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
          const d = delay + wIdx * 0.08;
          wIdx++;
          return reduce ? (
            <span key={i} className="inline-block">{w}</span>
          ) : (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: -40, rotate: -3, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
              transition={{
                type: "spring",
                stiffness: 90,
                damping: 14,
                mass: 0.8,
                delay: d,
              }}
              className="inline-block"
            >
              {w}
            </motion.span>
          );
        })}
      </>
    );
  }
  return <>{children}</>;
}

export function Word({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={`inline-block ${className}`}>{children}</span>;
  return (
    <motion.span
      initial={{ opacity: 0, y: -40, rotate: -3, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 90, damping: 14, mass: 0.8, delay }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.span>
  );
}
