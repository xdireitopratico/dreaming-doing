"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Reveal } from "../../components/Motion";

export interface FeatureLane {
  id: string;
  label: string;
  headline: string;
  description: string;
  visual?: React.ReactNode;
}

export interface SectionTabsFeatureLanesProps {
  eyebrow?: string;
  title: string;
  lanes: FeatureLane[];
  defaultLaneId?: string;
  className?: string;
}

export function SectionTabsFeatureLanes({
  eyebrow,
  title,
  lanes,
  defaultLaneId,
  className,
}: SectionTabsFeatureLanesProps) {
  const [active, setActive] = React.useState(defaultLaneId ?? lanes[0]?.id ?? "");
  const current = lanes.find((l) => l.id === active) ?? lanes[0];

  return (
    <section className={cn("w-full py-20 md:py-28", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {eyebrow && (
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-500">{eyebrow}</p>
        )}
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h2>
        <div className="mt-10 flex flex-wrap gap-2 border-b border-border pb-4">
          {lanes.map((lane) => (
            <button
              key={lane.id}
              type="button"
              onClick={() => setActive(lane.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                active === lane.id
                  ? "bg-brand-500 text-brand-foreground"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {lane.label}
            </button>
          ))}
        </div>
        {current && (
          <Reveal key={current.id} direction="up" distance={24}>
            <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className="min-h-[240px] rounded-2xl border border-border bg-surface-1 p-4">
                {current.visual ?? (
                  <div className="flex h-full min-h-[200px] items-center justify-center text-muted-foreground">
                    Preview {current.label}
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-display text-2xl font-semibold text-foreground">{current.headline}</h3>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{current.description}</p>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}