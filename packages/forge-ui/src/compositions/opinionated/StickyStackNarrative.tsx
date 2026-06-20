"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Reveal } from "../../components/Motion";

export interface StickyStackItem {
  id: string;
  title: string;
  description: string;
  visual?: React.ReactNode;
}

export interface StickyStackNarrativeProps {
  stickyTitle: string;
  stickyDescription: string;
  items: StickyStackItem[];
  parallaxDepth?: number;
  className?: string;
}

export function StickyStackNarrative({
  stickyTitle,
  stickyDescription,
  items,
  parallaxDepth = 0.3,
  className,
}: StickyStackNarrativeProps) {
  return (
    <section className={cn("relative w-full", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16">
          <div className="lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col lg:justify-center lg:py-20">
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-6">
              {stickyTitle}
            </h2>
            <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
              {stickyDescription}
            </p>
          </div>
          <div className="py-20 space-y-24 lg:space-y-32">
            {items.map((item) => (
              <Reveal key={item.id} direction="up" distance={40}>
                <div className="space-y-4">
                  <h3 className="font-display text-xl font-semibold text-foreground">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                  {item.visual && (
                    <div
                      className="mt-6 rounded-2xl overflow-hidden border border-border"
                      style={{ transform: `translateY(0)` }}
                    >
                      {item.visual}
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
