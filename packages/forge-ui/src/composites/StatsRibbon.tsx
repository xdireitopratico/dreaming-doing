"use client";

import { cn } from "../utils";
import { FadeIn, StaggerContainer, StaggerItem } from "../components/Motion";

export interface StatItem {
  value: string;
  label: string;
  suffix?: string;
}

export interface StatsRibbonProps {
  stats: StatItem[];
  className?: string;
  variant?: "inline" | "cards";
}

export function StatsRibbon({ stats, className, variant = "inline" }: StatsRibbonProps) {
  return (
    <StaggerContainer
      className={cn(
        variant === "inline"
          ? "flex flex-wrap gap-8 md:gap-12"
          : "grid grid-cols-2 md:grid-cols-4 gap-4",
        className,
      )}
    >
      {stats.map((stat) => (
        <StaggerItem key={stat.label}>
          <FadeIn>
            <div
              className={cn(
                variant === "cards" && "rounded-xl border border-border bg-surface-2/50 p-4 md:p-6",
              )}
            >
              <p className="font-display text-2xl md:text-3xl font-semibold text-foreground tabular-nums">
                {stat.value}
                {stat.suffix && <span className="text-brand-500">{stat.suffix}</span>}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </FadeIn>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}