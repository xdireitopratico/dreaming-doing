"use client";

import * as React from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  HTMLMotionProps,
} from "framer-motion";
import { cn } from "../utils";

const spring = { type: "spring" as const, stiffness: 500, damping: 40, mass: 0.8 };
const easeOut = { type: "tween" as const, ease: [0.25, 0.46, 0.45, 0.94] as const, duration: 0.3 };

export interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  distance?: number;
}

export function FadeIn({
  children,
  className,
  delay = 0,
  direction = "up",
  distance = 8,
  ...props
}: FadeInProps) {
  const initial = {
    opacity: 0,
    y: direction === "up" ? distance : direction === "down" ? -distance : 0,
    x: direction === "left" ? distance : direction === "right" ? -distance : 0,
  };
  return (
    <motion.div
      initial={initial}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ ...easeOut, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface SlideInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  from?: "left" | "right" | "top" | "bottom";
}

export function SlideIn({ children, className, delay = 0, from = "left", ...props }: SlideInProps) {
  const initial = {
    opacity: 0,
    x: from === "left" ? -100 : from === "right" ? 100 : 0,
    y: from === "top" ? -100 : from === "bottom" ? 100 : 0,
  };
  return (
    <motion.div
      initial={initial}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...spring, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface ScaleInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  scale?: number;
}

export function ScaleIn({ children, className, delay = 0, scale = 0.9, ...props }: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerContainerProps extends HTMLMotionProps<"div"> {
  delayChildren?: number;
  staggerChildren?: number;
}

export function StaggerContainer({
  children,
  className,
  delayChildren = 0.1,
  staggerChildren = 0.08,
  ...props
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren, delayChildren },
        },
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export type StaggerItemProps = HTMLMotionProps<"div">;

export function StaggerItem({ children, className, ...props }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 500, damping: 40 } },
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface HoverScaleProps extends HTMLMotionProps<"button"> {
  scale?: number;
}

export function HoverScale({ children, className, scale = 1.02, ...props }: HoverScaleProps) {
  return (
    <motion.button
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export interface HoverLiftProps extends HTMLMotionProps<"div"> {
  lift?: number;
}

export function HoverLift({ children, className, lift = 4, ...props }: HoverLiftProps) {
  return (
    <motion.div
      whileHover={{ y: -lift, boxShadow: "var(--forge-shadow-xl)" }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn("transition-shadow duration-200", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface PulseProps extends HTMLMotionProps<"div"> {
  scale?: number;
  duration?: number;
}

export function Pulse({ children, className, scale = 1.05, duration = 1.5, ...props }: PulseProps) {
  return (
    <motion.div
      animate={{ scale: [1, scale, 1] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export type ShimmerProps = HTMLMotionProps<"div">;

export function Shimmer({ className, ...props }: ShimmerProps) {
  return (
    <motion.div
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      className={cn(
        "relative overflow-hidden bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { type: "tween", ease: [0.25, 0.46, 0.45, 0.94], duration: 0.3 },
};

export const modalTransition = {
  initial: { opacity: 0, scale: 0.95, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 20 },
  transition: { type: "spring", stiffness: 500, damping: 40 },
};

export const drawerTransition = (side: "left" | "right" | "top" | "bottom" = "right") => ({
  initial: {
    x: side === "left" ? -300 : side === "right" ? 300 : 0,
    y: side === "top" ? -300 : side === "bottom" ? 300 : 0,
  },
  animate: { x: 0, y: 0 },
  exit: {
    x: side === "left" ? -300 : side === "right" ? 300 : 0,
    y: side === "top" ? -300 : side === "bottom" ? 300 : 0,
  },
  transition: { type: "spring", stiffness: 500, damping: 40 },
});

/* ───────────────────────── Motion 2.0 — qualidade profissional ───────────────────────── */

/** Presets de física pra variação de personalidade. */
export const springPresets = {
  snappy: { type: "spring" as const, stiffness: 500, damping: 40, mass: 0.8 },
  soft: { type: "spring" as const, stiffness: 180, damping: 26, mass: 1 },
  bouncy: { type: "spring" as const, stiffness: 320, damping: 14, mass: 0.9 },
  gentle: { type: "spring" as const, stiffness: 120, damping: 20, mass: 1.1 },
};

/** Revela o conteúdo quando entra no viewport — o pilar do "scroll storytelling". */
export interface RevealProps extends HTMLMotionProps<"div"> {
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  once?: boolean;
  amount?: number;
}

export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
  distance = 24,
  once = true,
  amount = 0.2,
  ...props
}: RevealProps) {
  const offset =
    direction === "up" ? distance : direction === "down" ? -distance : 0;
  const xOff =
    direction === "left" ? distance : direction === "right" ? -distance : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: offset, x: xOff }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once, amount }}
      transition={{ ...easeOut, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Parallax sutil — translada Y conforme o scroll da janela. Sinta a profundidade. */
export interface ParallaxProps extends HTMLMotionProps<"div"> {
  speed?: number;
}

export function Parallax({ children, className, speed = 0.3, ...props }: ParallaxProps) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 1000 * speed]);
  return (
    <motion.div style={{ y }} className={cn(className)} {...props}>
      {children}
    </motion.div>
  );
}

/** Botão que atrai o cursor — micro-interação de alta classe. */
export interface MagneticButtonProps extends HTMLMotionProps<"button"> {
  strength?: number;
}

export function MagneticButton({
  children,
  className,
  strength = 0.35,
  ...props
}: MagneticButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, springPresets.snappy);
  const sy = useSpring(y, springPresets.snappy);

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Texto com brilho deslizante — para títulos de destaque e CTAs premium. */
export interface TextShimmerProps extends HTMLMotionProps<"span"> {
  duration?: number;
}

export function TextShimmer({
  children,
  className,
  duration = 2.5,
  ...props
}: TextShimmerProps) {
  return (
    <motion.span
      aria-label={typeof children === "string" ? children : undefined}
      className={cn(
        "inline-block bg-[length:200%_100%] bg-clip-text text-transparent",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(110deg, var(--color-muted-foreground) 30%, var(--color-foreground) 50%, var(--color-muted-foreground) 70%)",
      }}
      animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
      {...props}
    >
      {children}
    </motion.span>
  );
}

/** Hook de progresso de scroll (0–1) para animações custom linkadas ao scroll. */
export function useScrollProgress(target?: React.RefObject<HTMLElement>) {
  const { scrollYProgress } = useScroll(
    target ? { target, offset: ["start end", "end start"] } : undefined,
  );
  return useSpring(scrollYProgress, springPresets.soft);
}
