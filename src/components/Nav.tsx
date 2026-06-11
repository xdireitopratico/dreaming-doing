import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function HudTelemetry() {
  const [alt, setAlt] = useState(408);
  const [vel, setVel] = useState(7.8);
  const [temp, setTemp] = useState(1240);
  useEffect(() => {
    const id = setInterval(() => {
      setAlt((a) => +(a + (Math.random() - 0.5) * 2).toFixed(1));
      setVel((v) => +(v + (Math.random() - 0.5) * 0.05).toFixed(2));
      setTemp((t) => Math.round(t + (Math.random() - 0.5) * 8));
    }, 700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden md:flex items-center gap-3 font-mono text-[10px] tracking-widest text-[var(--text-dim)] uppercase">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--success)] live-dot" />
      <span>
        ALT <span className="text-[var(--tertiary)]">{alt.toFixed(1)}</span>KM
      </span>
      <span className="opacity-30">·</span>
      <span>
        VEL <span className="text-[var(--tertiary)]">{vel.toFixed(2)}</span>KM/S
      </span>
      <span className="opacity-30">·</span>
      <span>
        TEMP <span className="text-[var(--primary)]">{temp}</span>°C
      </span>
    </div>
  );
}

function ScrambleLink({ to, label }: { to: string; label: string }) {
  const [text, setText] = useState(label);
  function scramble() {
    const chars = "█▓▒░ABCDEFGHIJKLMNOPQRSTUVWXYZ01";
    let i = 0;
    const id = setInterval(() => {
      i++;
      setText(
        label
          .split("")
          .map((c, idx) => (idx < i ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join(""),
      );
      if (i >= label.length) {
        clearInterval(id);
        setText(label);
      }
    }, 30);
  }
  return (
    <Link
      to={to}
      onMouseEnter={scramble}
      className="font-mono text-xs tracking-[0.2em] uppercase text-[var(--foreground)]/80 hover:text-[var(--primary)] transition-colors"
    >
      {text}
    </Link>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 80);
    on();
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass border-b border-[var(--border)]" : "border-b border-transparent"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <svg width="22" height="22" viewBox="0 0 24 24" className="text-[var(--primary)]">
            <polygon
              points="12,1 22,7 22,17 12,23 2,17 2,7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <polygon
              points="12,5 18,8.5 18,15.5 12,19 6,15.5 6,8.5"
              fill="currentColor"
              opacity="0.18"
            />
          </svg>
          <span className="font-display font-bold tracking-[0.18em] text-sm">FORGE</span>
          <span className="hidden md:inline-block h-4 w-px bg-[var(--border)] mx-2" />
          <HudTelemetry />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <ScrambleLink to="/" label="MISSION" />
          <ScrambleLink to="/#features" label="FEATURES" />
          <ScrambleLink to="/#how-it-works" label="DOCS" />
          <ScrambleLink to="/#cta" label="PRICING" />
        </div>

        <Link
          to="/projects"
          className="relative group font-mono text-xs tracking-[0.2em] uppercase px-5 py-2.5 border border-[var(--primary)]/60 text-[var(--primary)] hover:text-[var(--background)] hover:bg-[var(--primary)] transition-all"
        >
          COMEÇAR →
        </Link>
      </div>
    </nav>
  );
}
