"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../../components/Button";

export interface HeroBrutalistTypographyProps {
  title: string;
  subtitle?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  accentWord?: string;
  bgColor?: string;
  textColor?: string;
  grainOpacity?: number;
  className?: string;
}

export function HeroBrutalistTypography({
  title,
  subtitle,
  cta,
  accentWord,
  bgColor = "var(--color-background, #050505)",
  textColor = "var(--color-foreground, #FAFAFA)",
  grainOpacity = 0.04,
  className,
}: HeroBrutalistTypographyProps) {
  const words = title.split(" ");
  const accentIdx = accentWord
    ? words.findIndex((w) => w.toLowerCase().includes(accentWord.toLowerCase()))
    : -1;

  return (
    <section
      className={cn("relative w-full overflow-hidden min-h-[90vh] flex flex-col items-center justify-center", className)}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-50 mix-blend-overlay"
        style={{
          opacity: grainOpacity,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 text-center">
        <h1
          className="font-display font-bold leading-none tracking-tighter"
          style={{
            fontSize: "clamp(4rem, 15vw, 14rem)",
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
          }}
        >
          {words.map((word, i) => (
            <React.Fragment key={i}>
              <span
                className="inline-block overflow-hidden"
                style={{
                  animation: `brutalist-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s both`,
                }}
              >
                <span
                  className="inline-block"
                  style={{
                    color: i === accentIdx ? "var(--color-brand-500, #FFB627)" : undefined,
                  }}
                >
                  {word}
                </span>
              </span>
              {i < words.length - 1 ? " " : ""}
            </React.Fragment>
          ))}
        </h1>
        {subtitle && (
          <p
            className="mt-8 text-sm sm:text-base opacity-60 max-w-md mx-auto"
            style={{ animation: "brutalist-fade 0.6s ease ${words.length * 0.12 + 0.3}s both" }}
          >
            {subtitle}
          </p>
        )}
        {cta && (
          <div className="mt-12" style={{ animation: `brutalist-fade 0.6s ease ${words.length * 0.12 + 0.5}s both` }}>
            <Button
              variant="ghost"
              size="lg"
              onClick={cta.onClick}
              className="border-b-2 border-current rounded-none px-0 pb-1 hover:opacity-70"
            >
              {cta.label} →
            </Button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes brutalist-reveal {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes brutalist-fade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 0.6; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
