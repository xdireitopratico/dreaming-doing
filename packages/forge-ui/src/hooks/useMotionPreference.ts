"use client";

import { useMediaQuery } from "./index";

export function useMotionPreference() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
