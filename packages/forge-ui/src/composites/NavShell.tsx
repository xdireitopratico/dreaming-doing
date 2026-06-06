"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { cn } from "../utils";
import { Button } from "../components/Button";
import { FadeIn } from "../components/Motion";

export interface NavLink {
  label: string;
  href: string;
}

export interface NavShellProps {
  logo: React.ReactNode;
  links: NavLink[];
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
}

export function NavShell({ logo, links, ctaLabel, onCta, className }: NavShellProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <FadeIn>
      <header
        className={cn(
          "sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl",
          className,
        )}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-display font-semibold">{logo}</div>

          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
            {ctaLabel && (
              <Button size="sm" onClick={onCta}>
                {ctaLabel}
              </Button>
            )}
          </div>

          <button
            type="button"
            className="md:hidden p-2 text-foreground"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open && (
          <div className="md:hidden border-t border-border bg-surface-1 px-4 py-4 space-y-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block text-sm text-muted-foreground hover:text-foreground py-2"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {ctaLabel && (
              <Button fullWidth onClick={() => { onCta?.(); setOpen(false); }}>
                {ctaLabel}
              </Button>
            )}
          </div>
        )}
      </header>
    </FadeIn>
  );
}