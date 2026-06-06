"use client";

import * as React from "react";
import { cn } from "../utils";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { FadeIn, StaggerContainer, StaggerItem } from "../components/Motion";
import type { HeroVariant } from "../patterns/hero-composite";

export interface HeroCTA {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

export interface HeroSignatureProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryCta: HeroCTA;
  secondaryCta?: HeroCTA;
  variant?: HeroVariant;
  children?: React.ReactNode;
  className?: string;
}

const variantBg: Record<HeroVariant, string> = {
  aurora:
    "before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,182,39,0.18),transparent)] before:pointer-events-none",
  mesh:
    "before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_20%_30%,rgba(255,122,26,0.12),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(34,197,94,0.08),transparent_50%)] before:pointer-events-none",
  minimal: "",
  split: "lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center",
};

function CtaButton({ cta }: { cta: HeroCTA }) {
  const btn = (
    <Button variant={cta.variant ?? "primary"} size="lg" onClick={cta.onClick}>
      {cta.label}
    </Button>
  );
  if (cta.href) {
    return (
      <a href={cta.href} className="inline-flex">
        {btn}
      </a>
    );
  }
  return btn;
}

export function HeroSignature({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  variant = "aurora",
  children,
  className,
}: HeroSignatureProps) {
  return (
    <section
      className={cn(
        "relative w-full overflow-hidden py-20 md:py-28 lg:py-32",
        variantBg[variant],
        className,
      )}
    >
      <div className={cn("relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", variant === "split" && variantBg.split)}>
        <StaggerContainer className="max-w-4xl space-y-8">
          {eyebrow && (
            <StaggerItem>
              <Badge variant="glow" dot>
                {eyebrow}
              </Badge>
            </StaggerItem>
          )}
          <StaggerItem>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-foreground">
              <span className="bg-gradient-to-br from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                {title}
              </span>
            </h1>
          </StaggerItem>
          {subtitle && (
            <StaggerItem>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
            </StaggerItem>
          )}
          <StaggerItem>
            <div className="flex flex-wrap items-center gap-4">
              <CtaButton cta={primaryCta} />
              {secondaryCta && <CtaButton cta={{ ...secondaryCta, variant: secondaryCta.variant ?? "outline" }} />}
            </div>
          </StaggerItem>
        </StaggerContainer>
        {children && <FadeIn delay={0.3} className="mt-12 md:mt-16">{children}</FadeIn>}
      </div>
    </section>
  );
}