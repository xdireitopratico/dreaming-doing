"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Reveal } from "../../components/Motion";

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQAccordionCraftProps {
  title: string;
  subtitle?: string;
  items: FAQItem[];
  className?: string;
}

export function FAQAccordionCraft({ title, subtitle, items, className }: FAQAccordionCraftProps) {
  const [openId, setOpenId] = React.useState<string | null>(items[0]?.id ?? null);

  return (
    <section className={cn("w-full py-20 md:py-28", className)}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal direction="up">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h2>
          {subtitle && <p className="mt-4 text-muted-foreground">{subtitle}</p>}
        </Reveal>
        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-surface-1">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <div key={item.id} className="px-6 py-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-4 text-left font-medium text-foreground"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                >
                  <span>{item.question}</span>
                  <span className="text-brand-500">{open ? "−" : "+"}</span>
                </button>
                {open && (
                  <Reveal direction="up" distance={8}>
                    <p className="pb-4 text-muted-foreground leading-relaxed">{item.answer}</p>
                  </Reveal>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}