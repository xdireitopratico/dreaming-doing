"use client";

import * as React from "react";
import { cn } from "../../utils";

export interface KineticHeadlineRevealProps {
  words: string[];
  subtitle?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  accentWordIndex?: number;
  grainOpacity?: number;
  className?: string;
}

export function KineticHeadlineReveal({
  words,
  subtitle,
  cta,
  accentWordIndex,
  grainOpacity = 0.03,
  className,
}: KineticHeadlineRevealProps) {
  return (
    <section className={cn("relative w-full overflow-hidden min-h-[80vh] flex flex-col items-center justify-center", className)}>
      <div
        className="pointer-events-none absolute inset-0 z-50 mix-blend-overlay"
        style={{
          opacity: grainOpacity,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 text-center">
        <h1
          className="font-display font-bold leading-none"
          style={{
            fontSize: "clamp(3rem, 10vw, 9rem)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          {words.map((word, i) => (
            <span key={i} className="inline-block overflow-hidden">
              <span
                className="inline-block"
                style={{
                  animation: `kinetic-reveal 1s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s both`,
                  color: i === accentWordIndex ? "var(--color-brand-500, #FFB627)" : undefined,
                }}
              >
                {word}
              </span>
              {i < words.length - 1 ? "\u00A0" : ""}
            </span>
          ))}
        </h1>
        {subtitle && (
          <p
            className="mt-8 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto"
            style={{ animation: `kinetic-fade 0.6s ease ${words.length * 0.12 + 0.4}s both` }}
          >
            {subtitle}
          </p>
        )}
        {cta && (
          <div style={{ animation: `kinetic-fade 0.6s ease ${words.length * 0.12 + 0.6}s both` }}>
            <a
              href={cta.href}
              onClick={cta.onClick}
              className="mt-12 inline-block text-lg border-b-2 border-current pb-1 hover:opacity-70 transition-opacity"
            >
              {cta.label} →
            </a>
          </div>
        )}
      </div>
      <style>{`
        @keyframes kinetic-reveal {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes kinetic-fade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
