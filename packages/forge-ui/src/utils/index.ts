import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function variant<T extends Record<string, string>>(
  base: string,
  variants: Record<string, T>,
  selected: Record<string, string>,
): string {
  const classes = [base];
  for (const [key, value] of Object.entries(selected)) {
    if (variants[key]?.[value]) {
      classes.push(variants[key][value]!);
    }
  }
  return classes.join(" ");
}

export function focusRing(color: string = "brand-500"): string {
  return `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-${color}`;
}

export function transition(props: string[] = ["all"], duration: string = "normal"): string {
  const dur = duration === "fast" ? "150ms" : duration === "slow" ? "300ms" : "200ms";
  return props.map(p => `transition-${p} duration-[${dur}] ease-out`).join(" ");
}

export function glass(intensity: "light" | "medium" | "heavy" = "medium"): string {
  const opacity = { light: "0.4", medium: "0.62", heavy: "0.8" }[intensity];
  return `bg-white/[${opacity}] backdrop-blur-[24px] backdrop-saturate-[140%] border border-white/[0.08]`;
}

export function textGradient(colors: string[] = ["#FFB627", "#FF7A1A"]): string {
  const stops = colors.map((c, i) => `${c} ${Math.round(i * 100 / (colors.length - 1))}%`).join(", ");
  return `bg-[linear-gradient(135deg,${stops})] bg-clip-text text-transparent`;
}

export function gradientBorder(colors: string[] = ["#FFB627", "#FF7A1A"], width: string = "1px"): string {
  return `relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,${colors.join(",")})] before:-z-10 before:p-[${width}]`;
}