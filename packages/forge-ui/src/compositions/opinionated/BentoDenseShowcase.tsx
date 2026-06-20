"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Reveal, StaggerContainer, StaggerItem } from "../../components/Motion";

export interface BentoCard {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  visual?: React.ReactNode;
  span?: "default" | "wide" | "tall" | "highlight";
}

export interface BentoDenseShowcaseProps {
  highlightCard?: BentoCard;
  cards: BentoCard[];
  columns?: 3 | 4;
  spotlightEnabled?: boolean;
  className?: string;
}

export function BentoDenseShowcase({
  highlightCard,
  cards,
  columns = 4,
  spotlightEnabled = true,
  className,
}: BentoDenseShowcaseProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = React.useState({ x: 0, y: 0, visible: false });

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (rect) {
      setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
    }
  }, []);

  const spanClasses: Record<string, string> = {
    default: "col-span-1 row-span-1",
    wide: "col-span-2 row-span-1",
    tall: "col-span-1 row-span-2",
    highlight: "col-span-2 row-span-2",
  };

  return (
    <section className={cn("relative w-full py-20 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          ref={gridRef}
          onMouseMove={spotlightEnabled ? handleMouseMove : undefined}
          onMouseLeave={() => setSpotlight((s) => ({ ...s, visible: false }))}
          className="relative grid gap-4 auto-rows-[200px]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {spotlightEnabled && spotlight.visible && (
            <div
              className="pointer-events-none absolute inset-0 z-0 transition-opacity"
              style={{
                background: `radial-gradient(circle 300px at ${spotlight.x}px ${spotlight.y}px, color-mix(in srgb, var(--color-brand-500) 6%, transparent), transparent)`,
              }}
            />
          )}
          {highlightCard && (
            <div
              className={cn(
                "relative rounded-2xl border border-border bg-surface-2 p-6 flex flex-col justify-between hover:border-brand-500/30 transition-colors",
                spanClasses.highlight,
              )}
            >
              {highlightCard.icon && <div className="mb-4">{highlightCard.icon}</div>}
              <div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">{highlightCard.title}</h3>
                {highlightCard.description && <p className="text-sm text-muted-foreground">{highlightCard.description}</p>}
              </div>
              {highlightCard.visual && <div className="mt-4">{highlightCard.visual}</div>}
            </div>
          )}
          {cards.map((card) => (
            <div
              key={card.id}
              className={cn(
                "relative rounded-2xl border border-border bg-surface-1 p-6 flex flex-col justify-between hover:border-brand-500/20 hover:-translate-y-0.5 transition-all duration-200",
                spanClasses[card.span ?? "default"],
              )}
            >
              {card.icon && <div className="mb-3">{card.icon}</div>}
              <div>
                <h3 className="font-display text-base font-semibold text-foreground mb-1">{card.title}</h3>
                {card.description && <p className="text-sm text-muted-foreground">{card.description}</p>}
              </div>
              {card.visual && <div className="mt-3">{card.visual}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
