/** Remove overlays de transição da home (playWarp) que podem ficar presos no editor. */
export function clearForgeTransitionOverlays() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-forge-transition]").forEach((el) => el.remove());
}