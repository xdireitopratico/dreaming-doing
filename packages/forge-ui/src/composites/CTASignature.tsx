"use client";

import * as React from "react";
import { cn } from "../utils";
import { Button } from "../components/Button";
import { FadeIn, ScaleIn } from "../components/Motion";

export interface CTASignatureProps {
  title: string;
  description?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/** CTA composto — painel com gradiente e par de ações, nunca botão azul solto. */
export function CTASignature({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  className,
  children,
}: CTASignatureProps) {
  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScaleIn>
          <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-surface-2/80 p-8 md:p-12 lg:p-16 shadow-glow">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,182,39,0.15),transparent_60%)] pointer-events-none" />
            <FadeIn className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="max-w-xl space-y-3">
                <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight">{title}</h2>
                {description && <p className="text-muted-foreground text-base md:text-lg">{description}</p>}
              </div>
              <div className="flex flex-wrap gap-4 shrink-0">
                <Button size="xl" onClick={onPrimary}>
                  {primaryLabel}
                </Button>
                {secondaryLabel && (
                  <Button variant="outline" size="xl" onClick={onSecondary}>
                    {secondaryLabel}
                  </Button>
                )}
              </div>
            </FadeIn>
            {children && <div className="relative z-10 mt-8">{children}</div>}
          </div>
        </ScaleIn>
      </div>
    </section>
  );
}