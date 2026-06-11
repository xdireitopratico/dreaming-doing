"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { cn } from "../utils";
import { Avatar, AvatarFallback, AvatarImage } from "../components/Avatar";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { FadeIn } from "../components/Motion";

export interface Testimonial {
  quote: string;
  author: string;
  role?: string;
  avatarUrl?: string;
  avatarFallback?: string;
}

export interface TestimonialCarouselProps {
  testimonials: Testimonial[];
  className?: string;
  title?: string;
}

export function TestimonialCarousel({ testimonials, className, title }: TestimonialCarouselProps) {
  const [index, setIndex] = React.useState(0);
  const current = testimonials[index];

  if (!current) return null;

  const prev = () => setIndex((i) => (i === 0 ? testimonials.length - 1 : i - 1));
  const next = () => setIndex((i) => (i === testimonials.length - 1 ? 0 : i + 1));

  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {title && (
          <FadeIn className="mb-10 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-semibold">{title}</h2>
          </FadeIn>
        )}
        <FadeIn key={index}>
          <Card className="border-border/60 bg-surface-1/80">
            <CardContent className="p-8 md:p-12 space-y-8">
              <Quote className="h-8 w-8 text-brand-500/60" />
              <blockquote className="text-lg md:text-xl leading-relaxed text-foreground/90">
                &ldquo;{current.quote}&rdquo;
              </blockquote>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar>
                    {current.avatarUrl && (
                      <AvatarImage src={current.avatarUrl} alt={current.author} />
                    )}
                    <AvatarFallback>
                      {current.avatarFallback ?? current.author.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">{current.author}</p>
                    {current.role && (
                      <p className="text-sm text-muted-foreground">{current.role}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={prev}
                    aria-label="Depoimento anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={next}
                    aria-label="Próximo depoimento"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-center gap-1.5">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === index ? "w-6 bg-brand-500" : "w-1.5 bg-border",
                    )}
                    onClick={() => setIndex(i)}
                    aria-label={`Ir para depoimento ${i + 1}`}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </section>
  );
}
