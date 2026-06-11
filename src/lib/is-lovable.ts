/** True when running on Lovable preview/production (OAuth uses Lovable gateway). */
export function isLovableEnvironment(): boolean {
  if (import.meta.env.VITE_LOVABLE === "true") return true;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("lovable.app") || host.includes("lovableproject.com")) {
      return true;
    }
  }

  return false;
}
