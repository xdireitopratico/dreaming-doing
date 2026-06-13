/**
 * useCelebration — Micro-celebration system for milestones
 * Uses canvas-confetti (already installed) + CSS sparkles
 */
import { useCallback, useRef } from "react";
import confetti from "canvas-confetti";

type CelebrationLevel = "sparkle" | "checkmark" | "confetti_small" | "confetti_full" | "clapperboard";

export function useCelebration() {
  const lastCelebration = useRef(0);

  const celebrate = useCallback((level: CelebrationLevel = "sparkle") => {
    const now = Date.now();
    if (now - lastCelebration.current < 500) return; // debounce
    lastCelebration.current = now;

    switch (level) {
      case "sparkle":
        // Gold sparkle burst — small
        confetti({
          particleCount: 15,
          spread: 40,
          startVelocity: 15,
          gravity: 0.8,
          ticks: 60,
          colors: ["#c8a96e", "#f4d06f", "#ffffff"],
          origin: { x: 0.5, y: 0.6 },
          scalar: 0.6,
        });
        break;

      case "checkmark":
        // Gentle pulse — small confetti
        confetti({
          particleCount: 25,
          spread: 50,
          startVelocity: 20,
          gravity: 0.7,
          ticks: 80,
          colors: ["#7bc67e", "#c8a96e", "#f4d06f"],
          origin: { x: 0.5, y: 0.5 },
          scalar: 0.7,
        });
        break;

      case "confetti_small":
        // Lateral confetti — 3s
        confetti({
          particleCount: 40,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ["#c8a96e", "#6b9ac4", "#f4d06f"],
        });
        confetti({
          particleCount: 40,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ["#c8a96e", "#6b9ac4", "#f4d06f"],
        });
        break;

      case "confetti_full":
        // Full-screen celebration
        const end = Date.now() + 2000;
        const frame = () => {
          confetti({
            particleCount: 4,
            angle: 60,
            spread: 70,
            origin: { x: 0, y: Math.random() * 0.5 + 0.3 },
            colors: ["#c8a96e", "#f4d06f", "#6b9ac4", "#7bc67e"],
          });
          confetti({
            particleCount: 4,
            angle: 120,
            spread: 70,
            origin: { x: 1, y: Math.random() * 0.5 + 0.3 },
            colors: ["#c8a96e", "#f4d06f", "#6b9ac4", "#7bc67e"],
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
        break;

      case "clapperboard":
        // Confetti burst from center + top
        confetti({
          particleCount: 80,
          spread: 100,
          startVelocity: 30,
          gravity: 0.6,
          ticks: 120,
          colors: ["#c8a96e", "#f4d06f", "#ffffff", "#6b9ac4"],
          origin: { x: 0.5, y: 0.3 },
          scalar: 1,
        });
        break;
    }
  }, []);

  // Track achievements in localStorage
  const trackAchievement = useCallback((key: string) => {
    try {
      const achievements = JSON.parse(localStorage.getItem("vs_achievements") || "{}");
      if (!achievements[key]) {
        achievements[key] = new Date().toISOString();
        localStorage.setItem("vs_achievements", JSON.stringify(achievements));
        return true; // First time!
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return { celebrate, trackAchievement };
}
