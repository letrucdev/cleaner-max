import { motion, useReducedMotion } from "motion/react";

export interface DonutSegment {
  key: string;
  value: number;
  /** CSS color (token variable). */
  color: string;
}

const SIZE = 168;
const R = 66;
const STROKE = 18;
const C = 2 * Math.PI * R;
const GAP = 2;

/** Ring chart whose segments sweep in one after another. */
export function DonutChart({ segments, total, label, children }: { segments: DonutSegment[]; total: number; label: string; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  let start = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const len = (s.value / total) * C;
      const arc = { ...s, len: Math.max(len - GAP, 0), offset: -start, i };
      start += len;
      return arc;
    });

  return (
    <div className="relative size-42 shrink-0">
      <svg role="img" aria-label={label} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--track)" strokeWidth={STROKE} />
        {arcs.map((a) => (
          <motion.circle
            key={a.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={STROKE}
            strokeDashoffset={a.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
            animate={{ strokeDasharray: `${a.len} ${C}` }}
            transition={{ type: "spring", bounce: 0, duration: 0.7, delay: reduce ? 0 : 0.08 * a.i }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">{children}</div>
    </div>
  );
}
