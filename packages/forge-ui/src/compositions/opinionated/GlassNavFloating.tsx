"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../../components/Button";

export interface GlassNavLink {
  label: string;
  href: string;
  active?: boolean;
}

export interface GlassNavFloatingProps {
  logo: React.ReactNode;
  links: GlassNavLink[];
  cta?: { label: string; onClick?: () => void };
  bgVariant?: "mesh" | "aurora" | "minimal";
  rounded?: string;
  className?: string;
}

export function GlassNavFloating({
  logo,
  links,
  cta,
  rounded = "rounded-2xl",
  className,
}: GlassNavFloatingProps) {
  return (
    <div className={cn("sticky top-4 z-50 mx-auto max-w-5xl", className)}>
      <nav
        className={cn(
          "flex items-center justify-between border border-white/10 bg-surface-1/60 px-6 py-3 backdrop-blur-xl",
          rounded,
        )}
      >
        <div className="flex-shrink-0">{logo}</div>
        <div className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-brand-500",
                link.active ? "text-brand-500" : "text-muted-foreground",
              )}
            >
              {link.label}
            </a>
          ))}
        </div>
        {cta && (
          <Button variant="primary" size="sm" onClick={cta.onClick}>
            {cta.label}
          </Button>
        )}
      </nav>
    </div>
  );
}
