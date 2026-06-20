"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";

export interface ParallaxProductShowcaseProps {
  bgLayer?: React.ReactNode;
  midLayer?: React.ReactNode;
  productImage: React.ReactNode;
  headline: string;
  subhead?: string;
  cta?: { label: string; onClick?: () => void };
  parallaxSpeeds?: number[];
  className?: string;
}

export function ParallaxProductShowcase({
  bgLayer,
  midLayer,
  productImage,
  headline,
  subhead,
  cta,
  parallaxSpeeds = [0.2, 0.5, 1.0],
  className,
}: ParallaxProductShowcaseProps) {
  const [scrollY, setScrollY] = React.useState(0);
  const sectionRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const handleScroll = () => {
      const rect = sectionRef.current?.getBoundingClientRect();
      if (rect) {
        setScrollY(Math.max(0, -rect.top));
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className={cn("relative w-full overflow-hidden min-h-[100vh] flex flex-col items-center justify-center", className)}
    >
      {bgLayer && (
        <div
          className="absolute inset-0 z-0"
          style={{ transform: `translateY(${scrollY * parallaxSpeeds[0]}px)` }}
        >
          {bgLayer}
        </div>
      )}
      {midLayer && (
        <div
          className="absolute inset-0 z-10"
          style={{ transform: `translateY(${scrollY * parallaxSpeeds[1]}px)` }}
        >
          {midLayer}
        </div>
      )}
      <div
        className="relative z-20 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center"
        style={{ transform: `translateY(${scrollY * parallaxSpeeds[2] * 0.1}px)` }}
      >
        <Badge variant="glow" dot className="mb-6">Featured</Badge>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-foreground mb-6">
          {headline}
        </h1>
        {subhead && <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">{subhead}</p>}
        {cta && <Button variant="primary" size="lg" onClick={cta.onClick}>{cta.label}</Button>}
      </div>
      <div
        className="relative z-30 mt-12"
        style={{ transform: `translateY(${scrollY * parallaxSpeeds[2] * -0.05}px)` }}
      >
        {productImage}
      </div>
    </section>
  );
}
