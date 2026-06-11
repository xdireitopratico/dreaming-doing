import { cn } from "@/lib/utils";

export type PlanBannerVariant = "waiting" | "approved" | "rejected";

type PlanWaitingBannerProps = {
  variant: PlanBannerVariant;
  headline: string;
};

const BANNER_COPY: Record<PlanBannerVariant, string> = {
  waiting: "Waiting for user to approve plan",
  approved: "Build started",
  rejected: "Plan skipped",
};

export function PlanWaitingBanner({ variant, headline }: PlanWaitingBannerProps) {
  return (
    <div
      className={cn("forge-plan-waiting-banner", `forge-plan-waiting-banner--${variant}`)}
      data-testid="plan-waiting-banner"
      data-variant={variant}
    >
      <p className="forge-plan-waiting-banner-kicker">{BANNER_COPY[variant]}</p>
      <p className="forge-plan-waiting-banner-headline">{headline}</p>
    </div>
  );
}
