"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/Card";
import { HoverLift, FadeIn } from "../components/Motion";
import { BENTO_LAYOUT_PRESETS, type BentoPreset } from "../patterns/bento-signature";

export interface BentoCell {
  title: string;
  description?: string;
  icon?: LucideIcon;
  span?: string;
  children?: React.ReactNode;
  accent?: boolean;
}

export interface BentoGridProps {
  cells: BentoCell[];
  preset?: BentoPreset;
  className?: string;
  eyebrow?: string;
  title?: string;
}

export function BentoGrid({
  cells,
  preset = "showcase",
  className,
  eyebrow,
  title,
}: BentoGridProps) {
  const layout = BENTO_LAYOUT_PRESETS[preset];

  return (
    <section className={cn("w-full", className)}>
      {(eyebrow || title) && (
        <FadeIn className="mb-10 md:mb-14 text-center max-w-3xl mx-auto space-y-3">
          {eyebrow && (
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-brand-500">{eyebrow}</p>
          )}
          {title && (
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {title}
            </h2>
          )}
        </FadeIn>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 auto-rows-[minmax(140px,auto)]">
        {cells.map((cell, i) => {
          const Icon = cell.icon;
          const span = cell.span ?? layout[i % layout.length]?.span ?? "";
          return (
            <FadeIn key={cell.title} delay={i * 0.06} className={cn(span)}>
              <HoverLift className="h-full">
                <Card
                  className={cn(
                    "h-full border-border/60 bg-surface-1/80 backdrop-blur-sm",
                    cell.accent && "border-brand-500/30 shadow-glow",
                  )}
                >
                  <CardHeader className="space-y-3">
                    {Icon && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                        <Icon className="h-5 w-5" />
                      </div>
                    )}
                    <CardTitle className="font-display text-lg">{cell.title}</CardTitle>
                    {cell.description && <CardDescription>{cell.description}</CardDescription>}
                  </CardHeader>
                  {cell.children && <CardContent>{cell.children}</CardContent>}
                </Card>
              </HoverLift>
            </FadeIn>
          );
        })}
      </div>
    </section>
  );
}
