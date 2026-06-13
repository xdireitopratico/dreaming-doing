/**
 * PrometheusBoardroomRadar — SVG radar chart showing quality dimensions
 * Compact visual for the Boardroom bottom bar
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { BoardroomMessage, BoardroomPhase } from "./PrometheusBoardroom";

const PHASE_ORDER: BoardroomPhase[] = [
  "discovery", "clarification", "planning", "approval",
  "building", "testing", "review", "deploying", "complete",
];

interface Props {
  messages: BoardroomMessage[];
  phaseIndex: number;
}

const DIMENSIONS = [
  { key: "clarity",    label: "Clareza",     color: "hsl(142 70% 45%)" },
  { key: "coverage",   label: "Cobertura",   color: "hsl(210 100% 60%)" },
  { key: "safety",     label: "Segurança",   color: "hsl(0 70% 50%)" },
  { key: "efficiency", label: "Eficiência",  color: "hsl(25 100% 50%)" },
  { key: "testing",    label: "Testes",       color: "hsl(271 80% 55%)" },
];

const SIZE = 80;
const CENTER = SIZE / 2;
const RADIUS = 30;
const ANGLES = DIMENSIONS.map((_, i) => (Math.PI * 2 * i) / DIMENSIONS.length - Math.PI / 2);

function polarToXY(angle: number, r: number): [number, number] {
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
}

function polygonPoints(values: number[]): string {
  return values
    .map((v, i) => polarToXY(ANGLES[i], v * RADIUS))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

export function PrometheusBoardroomRadar({ messages, phaseIndex }: Props) {
  const scores = useMemo(() => {
    // BUG 18 FIX: Extract magic number to constant
    const TOTAL_PHASES = PHASE_ORDER.length; // 9
    const progress = (phaseIndex + 1) / TOTAL_PHASES;

    // Heuristic scores based on phase progress and message types
    const hasAnalyst = messages.some(m => m.agent === "analyst");
    const hasArchitect = messages.some(m => m.agent === "architect");
    const hasScribe = messages.some(m => m.agent === "scribe");
    const hasSentinel = messages.some(m => m.agent === "sentinel");
    const testResults = messages.filter(m => m.type === "test_result");

    return [
      Math.min(1, hasAnalyst ? 0.5 + progress * 0.5 : progress * 0.3),           // clarity
      Math.min(1, hasArchitect ? 0.4 + progress * 0.6 : progress * 0.25),         // coverage
      Math.min(1, hasSentinel ? 0.5 + progress * 0.5 : progress * 0.2),           // safety
      Math.min(1, hasScribe ? 0.4 + progress * 0.6 : progress * 0.3),             // efficiency
      Math.min(1, testResults.length > 0 ? 0.6 + progress * 0.4 : progress * 0.15), // testing
    ];
  }, [messages, phaseIndex]);

  // Grid rings
  const rings = [0.33, 0.66, 1];

  return (
    <div className="flex items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Grid */}
        {rings.map(r => (
          <polygon
            key={r}
            points={polygonPoints(DIMENSIONS.map(() => r))}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        ))}

        {/* Axes */}
        {ANGLES.map((angle, i) => {
          const [x, y] = polarToXY(angle, RADIUS);
          return (
            <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y}
              stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
          );
        })}

        {/* Data polygon */}
        <motion.polygon
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          points={polygonPoints(scores)}
          fill="rgba(59,130,246,0.12)"
          stroke="hsl(210 100% 60%)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {scores.map((v, i) => {
          const [x, y] = polarToXY(ANGLES[i], v * RADIUS);
          return (
            <circle key={i} cx={x} cy={y} r={2}
              fill={DIMENSIONS[i].color} stroke="var(--ps-bg-deep)" strokeWidth={1} />
          );
        })}

        {/* Labels */}
        {DIMENSIONS.map((d, i) => {
          const [x, y] = polarToXY(ANGLES[i], RADIUS + 10);
          return (
            <text key={d.key} x={x} y={y}
              textAnchor="middle" dominantBaseline="central"
              fill="var(--ps-cream-25)" fontSize={5} fontWeight={500}>
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
