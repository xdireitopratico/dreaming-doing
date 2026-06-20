"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { StaggerContainer, StaggerItem } from "../../components/Motion";

export interface HeroCinematicSpotlightProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryCta: { label: string; href?: string; onClick?: () => void };
  productVisual?: React.ReactNode;
  meshColors?: string[];
  spotlightRadius?: number;
  className?: string;
}

export function HeroCinematicSpotlight({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  productVisual,
  meshColors = ["var(--color-brand-500)", "var(--color-accent-500)"],
  spotlightRadius = 400,
  className,
}: HeroCinematicSpotlightProps) {
  const sectionRef = React.useRef<HTMLElement>(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className={cn("relative w-full overflow-hidden py-20 md:py-28 lg:py-32 min-h-[80vh] flex items-center", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, color-mix(in srgb, ${meshColors[0]} 12%, transparent), transparent 50%),
            radial-gradient(circle at 80% 70%, color-mix(in srgb, ${meshColors[1]} 8%, transparent), transparent 50%)
          `,
          animation: "cinematic-mesh 20s ease-in-out infinite alternate",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity"
        style={{
          background: `radial-gradient(circle ${spotlightRadius}px at ${mousePos.x}px ${mousePos.y}px, color-mix(in srgb, var(--color-brand-500) 8%, transparent), transparent)`,
        }}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex flex-col items-center text-center">
          <StaggerContainer className="space-y-6 max-w-3xl">
            {eyebrow && (
              <StaggerItem>
                <Badge variant="glow" dot>{eyebrow}</Badge>
              </StaggerItem>
            )}
            <StaggerItem>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
            </StaggerItem>
            {subtitle && (
              <StaggerItem>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
                  {subtitle}
                </p>
              </StaggerItem>
            )}
            <StaggerItem>
              <Button variant="primary" size="lg" onClick={primaryCta.onClick}>
                {primaryCta.label}
              </Button>
            </StaggerItem>
          </StaggerContainer>
          {productVisual && (
            <div
              className="mt-12 md:mt-16 w-full max-w-4xl"
              style={{ animation: "cinematic-float 6s ease-in-out infinite" }}
            >
              {productVisual}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes cinematic-mesh {
          0% { transform: scale(1) rotate(0deg); }
          100% { transform: scale(1.1) rotate(5deg); }
        }
        @keyframes cinematic-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </section>
  );
}
