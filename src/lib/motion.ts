import type { Transition, Variants } from "motion/react";

/**
 * Motion presets (apple-design / emil-design-eng skills):
 * critically damped springs (no bounce) for UI that wasn't flicked, strong ease-out for fades,
 * nothing enters from scale(0), everything stays under ~350ms.
 */
export const spring: Transition = { type: "spring", bounce: 0, duration: 0.35 };
export const springSnappy: Transition = { type: "spring", bounce: 0, duration: 0.25 };
export const easeOut = [0.23, 1, 0.32, 1] as const;

/** Page-to-page transition: a short rise + fade. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { ...spring, staggerChildren: 0.04, delayChildren: 0.02 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: easeOut } },
};

/** Child of a staggered container (cards, list sections). */
export const itemVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: spring },
};

/** Rows in a list that appear one after another. */
export const listVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.025 } },
};
