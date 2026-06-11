"use client";

import type * as React from "react";
import { cn } from "../utils";
import { Separator } from "../components/Separator";

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface FooterColumnsProps {
  brand: React.ReactNode;
  columns: FooterColumn[];
  copyright?: string;
  className?: string;
}

export function FooterColumns({ brand, columns, copyright, className }: FooterColumnsProps) {
  return (
    <footer className={cn("w-full border-t border-border bg-surface-1/40 pt-16 pb-8", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 md:gap-12">
          <div className="col-span-2 md:col-span-1 space-y-4">{brand}</div>
          {columns.map((col) => (
            <div key={col.title} className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-brand-500 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8" />
        {copyright && <p className="text-xs text-muted-foreground font-mono">{copyright}</p>}
      </div>
    </footer>
  );
}
