import { useCallback, useEffect, useRef, useState } from "react";

/** Sem interação no editor — descarrega iframe e para polling do preview. */
export const PREVIEW_IDLE_MS = 10 * 60 * 1000;

export function usePreviewIdle(active: boolean) {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpActivity = useCallback(() => {
    if (!active) return;
    setIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdle(true), PREVIEW_IDLE_MS);
  }, [active]);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    bumpActivity();
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    for (const ev of events) {
      window.addEventListener(ev, bumpActivity, { passive: true });
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bumpActivity);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, bumpActivity]);

  return { idle, bumpActivity };
}
