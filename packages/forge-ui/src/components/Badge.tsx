"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-2 text-foreground",
        brand: "border-brand-500/30 bg-brand-500/10 text-brand-500",
        accent: "border-accent-500/30 bg-accent-500/10 text-accent-500",
        outline: "border-border bg-transparent text-muted-foreground",
        glow: "border-brand-500/40 bg-brand-500/5 text-brand-500 shadow-glow",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
