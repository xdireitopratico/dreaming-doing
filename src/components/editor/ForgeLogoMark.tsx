import { Link } from "@tanstack/react-router";

/** Logo compacta FORGE para o editor (ícone + wordmark opcional). */
export function ForgeLogoMark({
  showWordmark = true,
  size = 20,
  linkTo = "/projects",
  title = "FORGE",
}: {
  showWordmark?: boolean;
  size?: number;
  linkTo?: string | false;
  title?: string;
}) {
  const mark = (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="shrink-0 text-[var(--forge-primary)]"
        aria-hidden
      >
        <polygon
          points="12,1 22,7 22,17 12,23 2,17 2,7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <polygon
          points="12,5 18,8.5 18,15.5 12,19 6,15.5 6,8.5"
          fill="currentColor"
          opacity="0.22"
        />
      </svg>
      {showWordmark && (
        <span className="font-display text-[11px] font-bold tracking-[0.14em] text-[var(--forge-text)]">
          FORGE
        </span>
      )}
    </>
  );

  if (linkTo === false) {
    return <span className="forge-logo-mark">{mark}</span>;
  }

  return (
    <Link to={linkTo} className="forge-logo-mark" title={title}>
      {mark}
    </Link>
  );
}