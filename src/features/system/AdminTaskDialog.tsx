import { listen } from "@tauri-apps/api/event";
import { Check, Info, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ItemResult } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Emitted by Rust when the window refuses to close because a task is running (lib.rs). */
const CLOSE_BLOCKED_EVENT = "close-blocked";

export interface AdminJob {
  title: string;
  startedAt: number;
  /** `undefined` while the task runs. */
  outcome?: { result: ItemResult } | { error: string };
}

const stepMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: spring,
};

/** "1:05" / "12:40". */
function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Modal shown for the whole life of an elevated task: it can't be dismissed while the task runs
 * (and the window refuses to close), then shows the outcome. The elevated process reports no
 * progress, so the bar is indeterminate and the elapsed time tells the user it's still alive.
 */
export function AdminTaskDialog({ job, onClose }: { job: AdminJob | null; onClose: () => void }) {
  const { t } = useTranslation();
  const running = job !== null && job.outcome === undefined;
  const [now, setNow] = useState(() => Date.now());
  const [closeBlocked, setCloseBlocked] = useState(false);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    setCloseBlocked(false);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen(CLOSE_BLOCKED_EVENT, () => setCloseBlocked(true))
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch(() => {});
    return () => {
      clearInterval(timer);
      disposed = true;
      unlisten?.();
    };
  }, [running]);

  return (
    <Dialog open={job !== null} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => running && e.preventDefault()}
        onInteractOutside={(e) => running && e.preventDefault()}
        className="gap-0 overflow-hidden rounded-[18px] border bg-popover p-0 shadow-[0_30px_80px_rgb(0_0_0/0.3)] sm:max-w-115"
      >
        <motion.div layout transition={spring} className="p-6">
          <AnimatePresence mode="wait" initial={false}>
            {job && running && (
              <motion.div key="running" {...stepMotion} className="flex flex-col gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fill" aria-hidden>
                    <ShieldCheck className="size-5.5 text-accent-text" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <DialogTitle className="text-[17px] font-bold">{job.title}</DialogTitle>
                    <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">{t("system.progressSub")}</DialogDescription>
                  </div>
                </div>
                <IndeterminateBar label={t("system.progressLabel", { task: job.title })} />
                <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                  <span>{t("system.progressHint")}</span>
                  <span className="tabular shrink-0" aria-live="off">
                    {t("system.elapsed", { time: formatElapsed(now - job.startedAt) })}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {closeBlocked && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={spring}
                      role="alert"
                      className="flex gap-2 overflow-hidden text-[12px] text-warning"
                    >
                      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                      {t("system.closeBlocked")}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {job?.outcome && (
              <motion.div key="outcome" {...stepMotion}>
                <Outcome title={job.title} outcome={job.outcome} onClose={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

/** A segment sweeping across; with reduced motion, the full bar softly pulses instead. */
function IndeterminateBar({ label }: { label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-busy className="relative h-2 overflow-hidden rounded-full bg-fill">
      <div className="absolute inset-y-0 left-0 w-2/5 animate-indeterminate rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-pulse" />
    </div>
  );
}

type Tone = "success" | "info" | "error";
const toneStyle: Record<Tone, { bg: string; fg: string; Icon: typeof Check }> = {
  success: { bg: "bg-success-soft", fg: "text-success", Icon: Check },
  info: { bg: "bg-fill", fg: "text-muted-foreground", Icon: Info },
  error: { bg: "bg-destructive/12", fg: "text-destructive", Icon: X },
};

function Outcome({ title, outcome, onClose }: { title: string; outcome: NonNullable<AdminJob["outcome"]>; onClose: () => void }) {
  const { t } = useTranslation();
  let tone: Tone;
  let heading: string;
  let detail: string | null = null;
  if ("error" in outcome) {
    tone = "error";
    heading = t("system.failed", { task: title });
    detail = outcome.error;
  } else {
    const r = outcome.result;
    if (r.status === "done" || r.status === "partial") {
      tone = "success";
      heading = r.freed > 0 ? t("system.doneFreed", { task: title, size: formatBytes(r.freed) }) : t("system.done", { task: title });
    } else if (r.status === "skipped") {
      tone = "info";
      heading = r.message && r.message !== "cancelled" ? r.message : t("system.cancelled");
    } else {
      tone = "error";
      heading = t("system.failed", { task: title });
      detail = r.message;
    }
  }
  const { bg, fg, Icon } = toneStyle[tone];

  return (
    <div className="flex flex-col items-center gap-3 pt-2 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: tone === "success" ? 0.35 : 0, duration: 0.5 }}
        className={cn("flex size-16 items-center justify-center rounded-full", bg)}
        aria-hidden
      >
        <Icon className={cn("size-8", fg)} strokeWidth={2.4} />
      </motion.div>
      <DialogTitle className="text-[17px] font-bold">{heading}</DialogTitle>
      {detail ? (
        <DialogDescription className="max-h-40 w-full overflow-y-auto rounded-[10px] bg-fill px-3 py-2 text-left font-mono text-[12px] whitespace-pre-wrap text-muted-foreground">
          {detail}
        </DialogDescription>
      ) : (
        <DialogDescription className="sr-only">{heading}</DialogDescription>
      )}
      <Button autoFocus onClick={onClose} className="mt-2 h-9 rounded-[9px] px-4.5 text-[13px] font-semibold">
        {t("common.done")}
      </Button>
    </div>
  );
}
