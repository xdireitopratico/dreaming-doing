"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "../utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/Card";
import { FadeIn, StaggerContainer, StaggerItem } from "../components/Motion";

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface FeatureMatrixProps {
  features: FeatureItem[];
  title?: string;
  subtitle?: string;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function FeatureMatrix({
  features,
  title,
  subtitle,
  columns = 3,
  className,
}: FeatureMatrixProps) {
  const colClass = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[
    columns
  ];

  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <FadeIn className="mb-12 text-center max-w-2xl mx-auto space-y-3">
            {title && <h2 className="font-display text-3xl md:text-4xl font-semibold">{title}</h2>}
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </FadeIn>
        )}
        <StaggerContainer className={cn("grid grid-cols-1 gap-6", colClass)}>
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <StaggerItem key={f.title}>
                <Card className="h-full border-border/50 bg-surface-1/60 hover:border-brand-500/20 transition-colors">
                  <CardHeader>
                    <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/20 to-accent-500/10 text-brand-500">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="font-display">{f.title}</CardTitle>
                    <CardDescription>{f.description}</CardDescription>
                  </CardHeader>
                  <CardContent />
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
