"use client";

import { Check } from "lucide-react";
import { cn } from "../utils";
import { Button } from "../components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/Card";
import { Badge } from "../components/Badge";
import { FadeIn, StaggerContainer, StaggerItem, HoverLift } from "../components/Motion";

export interface PricingTier {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  ctaLabel: string;
  highlighted?: boolean;
  onSelect?: () => void;
}

export interface PricingTiersProps {
  tiers: PricingTier[];
  title?: string;
  subtitle?: string;
  className?: string;
}

export function PricingTiers({ tiers, title, subtitle, className }: PricingTiersProps) {
  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <FadeIn className="mb-12 text-center space-y-3">
            {title && <h2 className="font-display text-3xl md:text-4xl font-semibold">{title}</h2>}
            {subtitle && <p className="text-muted-foreground max-w-xl mx-auto">{subtitle}</p>}
          </FadeIn>
        )}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {tiers.map((tier) => (
            <StaggerItem key={tier.name} className="h-full">
              <HoverLift className="h-full">
                <Card
                  className={cn(
                    "h-full flex flex-col",
                    tier.highlighted && "border-brand-500/40 shadow-glow scale-[1.02] md:scale-105",
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-display">{tier.name}</CardTitle>
                      {tier.highlighted && <Badge variant="brand">Popular</Badge>}
                    </div>
                    {tier.description && <CardDescription>{tier.description}</CardDescription>}
                    <div className="pt-4">
                      <span className="font-display text-4xl font-semibold">{tier.price}</span>
                      {tier.period && (
                        <span className="text-muted-foreground text-sm ml-1">/{tier.period}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {tier.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Check className="h-4 w-4 text-accent-500 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      fullWidth
                      variant={tier.highlighted ? "primary" : "secondary"}
                      onClick={tier.onSelect}
                    >
                      {tier.ctaLabel}
                    </Button>
                  </CardFooter>
                </Card>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
