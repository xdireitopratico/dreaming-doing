"use client";

import * as React from "react";
import { cn } from "../../utils";

export interface GrainArtisanalOverlayProps {
  intensity?: number;
  blendMode?: "overlay" | "multiply" | "soft-light" | "hard-light";
  tileSize?: number;
  children: React.ReactNode;
  className?: string;
}

export function GrainArtisanalOverlay({
  intensity = 0.04,
  blendMode = "overlay",
  tileSize = 200,
  children,
  className,
}: GrainArtisanalOverlayProps) {
  const grainSvg = React.useMemo(() => {
    const svg = `<svg viewBox='0 0 ${tileSize} ${tileSize}' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/%23/g, "%23")}")`;
  }, [tileSize]);

  return (
    <div className={cn("relative", className)}>
      {children}
      <div
        className="pointer-events-none absolute inset-0 z-[9999]"
        style={{
          opacity: intensity,
          mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 ${tileSize} ${tileSize}' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  );
}
