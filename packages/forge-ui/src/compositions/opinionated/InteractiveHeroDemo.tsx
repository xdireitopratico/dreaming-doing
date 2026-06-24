"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { StaggerContainer, StaggerItem } from "../../components/Motion";

export interface InteractiveHeroDemoProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryCta: { label: string; href?: string; onClick?: () => void };
  demo: React.ReactNode;
  demoCaption?: string;
  className?: string;
}

export function InteractiveHeroDemo({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  demo,
  demoCaption,
  className,
}: InteractiveHeroDemoProps) {
  return (
    <section className={cn("relative w-full overflow-hidden py-16 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <StaggerContainer>
            {eyebrow && (
              <StaggerItem>
                <Badge variant="secondary" className="mb-4">
                  {eyebrow}
                </Badge>
              </StaggerItem>
            )}
            <StaggerItem>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl lg:text-6xl">
                {title}
              </h1>
            </StaggerItem>
            {subtitle && (
              <StaggerItem>
                <p className="mt-6 max-w-lg text-lg text-muted-foreground">{subtitle}</p>
              </StaggerItem>
            )}
            <StaggerItem>
              <Button className="mt-8" onClick={primaryCta.onClick} asChild={!!primaryCta.href}>
                {primaryCta.href ? <a href={primaryCta.href}>{primaryCta.label}</a> : primaryCta.label}
              </Button>
            </StaggerItem>
          </StaggerContainer>
          <div className="relative">
            <div className="rounded-2xl border border-border bg-surface-1 p-3 shadow-glow">
              <div className="overflow-hidden rounded-xl border border-border/60 bg-background">{demo}</div>
            </div>
            {demoCaption && (
              <p className="mt-4 text-center text-sm text-muted-foreground">{demoCaption}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}