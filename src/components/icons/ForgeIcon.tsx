import type { SVGProps } from "react";

type Variant = "mark" | "build" | "connect" | "project" | "agent" | "referral" | "craft";

type Props = SVGProps<SVGSVGElement> & {
  variant?: Variant;
  size?: number;
};

/** Ícone da marca FORGE — hexágono/forja, sem sparkle genérico de IA. */
export function ForgeIcon({
  variant = "mark",
  size = 16,
  className = "",
  ...rest
}: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    ...rest,
  };

  if (variant === "mark") {
    return (
      <svg {...common}>
        <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />
        <polygon
          points="12,6 17,9 17,15 12,18 7,15 7,9"
          fill="currentColor"
          stroke="none"
          opacity={0.2}
        />
      </svg>
    );
  }

  if (variant === "build") {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 0l-1 1" />
        <path d="M8.3 17.7a4.5 4.5 0 0 0 6.4 0l1-1" />
        <path d="M12 8v8" />
        <path d="M9 12h6" />
        <polygon points="12,2 21,7 21,11 12,8 3,11 3,7" opacity={0.35} />
      </svg>
    );
  }

  if (variant === "connect") {
    return (
      <svg {...common}>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.4 11.2 15.2 7.2" />
        <path d="M8.4 12.8 15.2 16.8" />
      </svg>
    );
  }

  if (variant === "project") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 9h16" />
        <path d="M8 13h5" />
        <path d="M8 16h8" opacity={0.5} />
      </svg>
    );
  }

  if (variant === "agent") {
    return (
      <svg {...common}>
        <polygon points="12,3 20,8 20,16 12,21 4,16 4,8" opacity={0.4} />
        <path d="M9 12h6" />
        <path d="M12 9v6" />
      </svg>
    );
  }

  if (variant === "referral") {
    return (
      <svg {...common}>
        <path d="M12 3v18" opacity={0.25} />
        <path d="M8 7h8l-2 4H10l2 4" />
        <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  /* craft — edição / diff IA */
  return (
    <svg {...common}>
      <path d="M4 7h16" />
      <path d="M4 12h10" />
      <path d="M4 17h14" />
      <path d="M17 10l3 2-3 2" />
    </svg>
  );
}