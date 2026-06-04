import type { NavigateOptions, useNavigate } from "@tanstack/react-router";
import { parseAuthRedirect } from "@/lib/sanitize-next";

type NavigateFn = ReturnType<typeof useNavigate>;

export function navigateAfterAuth(navigate: NavigateFn, next?: string | null) {
  const target = parseAuthRedirect(next);
  if (target.params) {
    navigate({
      to: target.to,
      params: target.params,
    } as NavigateOptions);
  } else {
    navigate({ to: target.to } as NavigateOptions);
  }
}