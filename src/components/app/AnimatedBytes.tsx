import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A byte count that springs to its new value (instant with reduced motion). */
export function AnimatedBytes({ value, className }: { value: number; className?: string }) {
  useTranslation(); // re-render on language change (decimal separator)
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      setShown(value);
      return;
    }
    const controls = animate(mv, value, { type: "spring", bounce: 0, duration: 0.5, onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduce, mv]);

  return <span className={cn("tabular", className)}>{formatBytes(shown)}</span>;
}
