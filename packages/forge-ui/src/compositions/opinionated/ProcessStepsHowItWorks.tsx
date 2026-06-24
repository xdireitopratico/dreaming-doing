"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Reveal, StaggerContainer, StaggerItem } from "../../components/Motion";

export interface ProcessStep {
  id: string;
  title: string;
  description: string;
}

export interface ProcessStepsHowItWorksProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  steps: ProcessStep[];
  className?: string;
}

export function ProcessStepsHowItWorks({
  eyebrow,
  title,
  subtitle,
  steps,
  className,
}: ProcessStepsHowItWorksProps) {
  return (
    <section className={cn("w-full py-20 md:py-28 bg-surface-1/30", className)}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {eyebrow && (
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-brand-500">{eyebrow}</p>
        )}
        <h2 className="text-center font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {title}
        </h2>
        {subtitle && <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">{subtitle}</p>}
        <StaggerContainer className="mt-16 space-y-12">
          {steps.map((step, index) => (
            <StaggerItem key={step.id}>
              <Reveal direction="up" delay={index * 0.06}>
                <div className="flex gap-6 border-l-2 border-brand-500/30 pl-8">
                  <span className="font-display text-3xl font-bold tabular-nums text-brand-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </Reveal>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}