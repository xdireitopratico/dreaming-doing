"use client";

import * as React from "react";
import { cn } from "../utils";
import { Shimmer } from "./Motion";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  const classes = cn("rounded-lg bg-surface-3", className);
  if (shimmer) {
    return <Shimmer className={classes} />;
  }
  return <div className={classes} {...props} />;
}

export { Skeleton };