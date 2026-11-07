import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatedBytes } from "./AnimatedBytes";
import { spring } from "@/lib/motion";

/** Id of the overlay layer in App.tsx: outside the animated page, so `absolute` is relative to the window. */
export const PAGE_OVERLAY_ID = "page-overlay";

/**
 * Floating translucent bar that rises from the bottom while something is selected.
 * Rendered through a portal: inside the page it would be positioned against the page's
 * transform during the page transition and visibly jump when the transition ends.
 */
export function SelectionBar({
  visible,
  label,
  bytes,
  children,
}: {
  visible: boolean;
  label: string;
  bytes: number;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setTarget(document.getElementById(PAGE_OVERLAY_ID)), []);
  if (!target) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={spring}
          className="pointer-events-auto absolute right-6 bottom-5 left-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/85 py-3 pr-3 pl-5 shadow-[0_10px_30px_rgb(0_0_0/0.12)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-muted-foreground">{label}</span>
            <AnimatedBytes value={bytes} className="text-[22px] font-bold tracking-[-0.02em]" />
          </div>
          <div className="flex gap-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  );
}
