"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { FadeIn, StaggerContainer, StaggerItem } from "../../components/Motion";

export interface HeroEditorialSplitProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryCta: { label: string; href?: string; onClick?: () => void };
  secondaryCta?: { label: string; href?: string; onClick?: () => void };
  visual?: React.ReactNode;
  grainIntensity?: number;
  className?: string;
}

export function HeroEditorialSplit({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  visual,
  grainIntensity = 0.04,
  className,
}: HeroEditorialSplitProps) {
  return (
    <section className={cn("relative w-full overflow-hidden py-20 md:py-28 lg:py-32", className)}>
      <div
        className="pointer-events-none absolute inset-0 z-50 mix-blend-overlay"
        style={{
          opacity: grainIntensity,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-16 lg:items-center">
          <StaggerContainer className="lg:col-span-5 space-y-6">
            {eyebrow && (
              <StaggerItem>
                <Badge variant="glow" dot>{eyebrow}</Badge>
              </StaggerItem>
            )}
            <StaggerItem>
              <h1
                className="font-serif text-4xl sm:text-5xl md:text-6xl font-normal leading-tight tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-serif, Georgia, serif)" }}
              >
                {title}
              </h1>
            </StaggerItem>
            {subtitle && (
              <StaggerItem>
                <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                  {subtitle}
                </p>
              </StaggerItem>
            )}
            <StaggerItem>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="primary" size="lg" onClick={primaryCta.onClick}>
                  {primaryCta.label}
                </Button>
                {secondaryCta && (
                  <Button variant="outline" size="lg" onClick={secondaryCta.onClick}>
                    {secondaryCta.label}
                  </Button>
                )}
              </div>
            </StaggerItem>
          </StaggerContainer>
          {visual && (
            <FadeIn delay={0.3} className="mt-12 lg:mt-0 lg:col-span-7">
              {visual}
            </FadeIn>
          )}
        </div>
      </div>
    </section>
  );
}
