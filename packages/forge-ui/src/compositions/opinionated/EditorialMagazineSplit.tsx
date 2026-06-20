"use client";

import * as React from "react";
import { cn } from "../../utils";
import { FadeIn } from "../../components/Motion";

export interface EditorialMagazineSplitProps {
  headline: string;
  subhead?: string;
  bodyText?: string;
  visual: React.ReactNode;
  caption?: string;
  invertColumns?: boolean;
  className?: string;
}

export function EditorialMagazineSplit({
  headline,
  subhead,
  bodyText,
  visual,
  caption,
  invertColumns = false,
  className,
}: EditorialMagazineSplitProps) {
  return (
    <section className={cn("relative w-full py-20 md:py-28", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 lg:gap-0 lg:items-center">
          <div className={cn("lg:col-span-3 space-y-4", invertColumns && "lg:order-2 lg:col-span-3")}>
            <FadeIn>
              <h2
                className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal leading-tight text-foreground"
                style={{ fontFamily: "var(--font-serif, Georgia, serif)" }}
              >
                {headline}
              </h2>
            </FadeIn>
            {subhead && (
              <FadeIn delay={0.1}>
                <p className="text-base italic text-muted-foreground">{subhead}</p>
              </FadeIn>
            )}
            {bodyText && (
              <FadeIn delay={0.2}>
                <p className="text-sm text-muted-foreground leading-relaxed" style={{ lineHeight: 1.8 }}>
                  {bodyText}
                </p>
              </FadeIn>
            )}
          </div>
          <div className={cn("mt-8 lg:mt-0 lg:col-span-9", invertColumns && "lg:order-1 lg:col-span-9")}>
            <FadeIn delay={0.15} className="relative">
              <div className="relative overflow-hidden rounded-sm">
                {visual}
              </div>
              {caption && (
                <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground opacity-60">
                  {caption}
                </p>
              )}
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
