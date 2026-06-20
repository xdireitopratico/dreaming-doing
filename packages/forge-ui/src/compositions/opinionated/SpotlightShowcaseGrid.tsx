"use client";

import * as React from "react";
import { cn } from "../../utils";

export interface SpotlightCard {
  id: string;
  title: string;
  description?: string;
  visual?: React.ReactNode;
}

export interface SpotlightShowcaseGridProps {
  items: SpotlightCard[];
  columns?: 2 | 3;
  spotlightRadius?: number;
  spotlightColor?: string;
  className?: string;
}

export function SpotlightShowcaseGrid({
  items,
  columns = 3,
  spotlightRadius = 400,
  spotlightColor = "var(--color-brand-500)",
  className,
}: SpotlightShowcaseGridProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: -1000, y: -1000 });

  return (
    <section className={cn("relative w-full py-20 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          ref={gridRef}
          onMouseMove={(e) => {
            const rect = gridRef.current?.getBoundingClientRect();
            if (rect) setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onMouseLeave={() => setPos({ x: -1000, y: -1000 })}
          className="relative grid gap-6"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background: `radial-gradient(circle ${spotlightRadius}px at ${pos.x}px ${pos.y}px, color-mix(in srgb, ${spotlightColor} 5%, transparent), transparent)`,
            }}
          />
          {items.map((item) => (
            <div
              key={item.id}
              className="relative z-10 rounded-xl border border-border/50 bg-surface-1/50 p-8 transition-all duration-300 hover:border-border hover:bg-surface-1"
            >
              {item.visual && <div className="mb-6">{item.visual}</div>}
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">{item.title}</h3>
              {item.description && <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
