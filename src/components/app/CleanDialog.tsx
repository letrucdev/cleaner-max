import { useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, queryKeys, type CleanEvent, type CleanReport } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { spring } from "@/lib/motion";
import { itemKey } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { AnimatedBytes } from "./AnimatedBytes";

type Step = "confirm" | "running" | "done";
type RowState = "pending" | "running" | "done" | "partial" | "skipped" | "failed";

const stepMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: spring,
};

/** Confirm → progress (streamed from Rust) → summary. Opened through `useUi().openClean`. */
export function CleanDialog() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entries = useUi((s) => s.pendingClean);
  const skipped = useUi((s) => s.pendingSkipped);
  const closeClean = useUi((s) => s.closeClean);
  const setPage = useUi((s) => s.setPage);

  const [step, setStep] = useState<Step>("confirm");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [freed, setFreed] = useState(0);
  const [report, setReport] = useState<CleanReport | null>(null);

  const open = entries !== null;
  const list = entries ?? [];
  const total = list.length;
  const knownSize = list.reduce((s, e) => s + (e.size ?? 0), 0);
  const allKnown = list.every((e) => e.size !== null);
  const doneCount = Object.values(rows).filter((s) => s !== "pending" && s !== "running").length;
  const progress = total ? doneCount / total : 0;

  const labelByKey = useMemo(() => new Map(list.map((e) => [itemKey(e.item), e.label])), [list]);

  function reset() {
    setStep("confirm");
    setRows({});
    setFreed(0);
    setReport(null);
  }

  function close() {
    if (step === "running") return;
    closeClean();
    // Let the exit animation finish before clearing the content.
    setTimeout(reset, 200);
  }

  async function run() {
    setStep("running");
    setRows(Object.fromEntries(list.map((e) => [itemKey(e.item), "pending" as RowState])));
    const onEvent = (e: CleanEvent) => {
      if (e.type === "itemStarted") setRows((r) => ({ ...r, [e.key]: "running" }));
      if (e.type === "itemFinished") {
        setRows((r) => ({ ...r, [e.result.key]: e.result.status }));
        setFreed((f) => f + (e.result.freed ?? 0));
      }
    };
    try {
      const result = await api.clean(
        list.map((e) => e.item),
        false,
        onEvent,
      );
      setReport(result);
      setFreed(result.freed);
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.targets });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.history });
    }
  }

  const results = report?.results ?? [];
  const lockedFiles = results.reduce((s, r) => s + (r.status === "partial" ? r.failedCount : 0), 0);
  const failed = results.filter((r) => r.status === "failed").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length + skipped.length;
  const cleanedCount = results.filter((r) => r.status === "done" || r.status === "partial").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => step === "running" && e.preventDefault()}
        onInteractOutside={(e) => step === "running" && e.preventDefault()}
        className="gap-0 overflow-hidden rounded-[18px] border bg-popover p-0 shadow-[0_30px_80px_rgb(0_0_0/0.3)] sm:max-w-140"
      >
        <motion.div layout transition={spring} className="p-6">
          <AnimatePresence mode="wait" initial={false}>
            {step === "confirm" && (
              <motion.div key="confirm" {...stepMotion} className="flex flex-col gap-4.5">
                <div className="flex items-start gap-3.5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-destructive/12" aria-hidden>
                    <Trash2 className="size-5.5 text-destructive" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <DialogTitle className="text-[17px] font-bold">{t("clean.confirmTitle", { count: total })}</DialogTitle>
                    <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                      {knownSize > 0 ? t("clean.confirmBody", { size: formatBytes(knownSize) }) : t("clean.confirmBodyUnknown")}
                    </DialogDescription>
                  </div>
                </div>
                <ul className="max-h-75 overflow-y-auto rounded-xl border bg-background/60 py-1">
                  {list.map((e) => (
                    <li key={itemKey(e.item)} className="flex items-center gap-2.5 px-3.5 py-1.75 text-[13px]">
                      <span className="w-15 shrink-0 rounded-[5px] bg-fill py-px text-center text-[11px] font-semibold text-muted-foreground">
                        {e.where}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      <span className="tabular text-muted-foreground">{e.size === null ? t("common.unknown") : formatBytes(e.size)}</span>
                    </li>
                  ))}
                </ul>
                {skipped.length > 0 && (
                  <div className="flex gap-2 text-[12px] text-warning">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      {t("clean.skipped", { count: skipped.length })}{" "}
                      {skipped.map((s) => `${s.label} (${s.size === null ? "?" : formatBytes(s.size)}) — ${s.reason}`).join("; ")}
                    </span>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={close} className="h-9 rounded-[9px] px-4 text-[13px]">
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={run} className="h-9 rounded-[9px] bg-destructive-solid px-4.5 text-[13px] font-semibold text-white hover:bg-destructive-solid/90">
                    {allKnown || knownSize > 0 ? t("clean.delete", { size: formatBytes(knownSize) }) : t("clean.deleteUnknown")}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "running" && (
              <motion.div key="running" {...stepMotion} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <DialogTitle className="text-[17px] font-bold">{t("clean.progressTitle")}</DialogTitle>
                  <DialogDescription className="text-[13px] text-muted-foreground">
                    {t("clean.progressSub", { done: doneCount, total, size: formatBytes(freed) })}
                  </DialogDescription>
                </div>
                <div
                  role="progressbar"
                  aria-label={t("clean.progressLabel")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  className="h-2 overflow-hidden rounded-full bg-fill"
                >
                  <motion.div className="h-full origin-left rounded-full bg-primary" initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(progress, 0.03) }} transition={spring} />
                </div>
                <ul className="flex max-h-75 flex-col gap-0.5 overflow-y-auto">
                  {list.map((e) => {
                    const key = itemKey(e.item);
                    const s = rows[key] ?? "pending";
                    return (
                      <li
                        key={key}
                        ref={s === "running" ? (el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }) : undefined}
                        className={cn("flex min-h-7.5 items-center gap-2.5 text-[13px]", s === "pending" && "text-muted-foreground")}
                      >
                        <RowIcon state={s} />
                        <span className="min-w-0 flex-1 truncate">{labelByKey.get(key)}</span>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div key="done" {...stepMotion} className="flex flex-col items-center gap-3 pt-2 text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.35, duration: 0.5 }}
                  className="flex size-16 items-center justify-center rounded-full bg-success-soft"
                  aria-hidden
                >
                  <Check className="size-8 text-success" strokeWidth={2.4} />
                </motion.div>
                <DialogTitle className="text-[22px] font-bold tracking-[-0.02em]">
                  {t("clean.doneTitle", { size: "" }).trim()} <AnimatedBytes value={freed} />
                </DialogTitle>
                <DialogDescription className="text-[13px] text-muted-foreground">
                  {t("clean.doneSub", { done: cleanedCount, skipped: skippedCount })}
                  {failed > 0 && ` · ${t("clean.failed", { count: failed })}`}
                </DialogDescription>
                {lockedFiles > 0 && <p className="text-[12px] text-warning">{t("clean.lockedFiles", { count: lockedFiles })}</p>}
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    className="h-9 rounded-[9px] px-4 text-[13px]"
                    onClick={() => {
                      close();
                      setPage("history");
                    }}
                  >
                    {t("clean.viewHistory")}
                  </Button>
                  <Button onClick={close} className="h-9 rounded-[9px] px-4.5 text-[13px] font-semibold">
                    {t("common.done")}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

function RowIcon({ state }: { state: RowState }) {
  if (state === "running") {
    return <span aria-hidden className="m-px size-3.5 animate-spin rounded-full border-2 border-fill border-t-primary" />;
  }
  if (state === "pending") return <span aria-hidden className="m-1 size-2 rounded-full bg-fill" />;
  if (state === "skipped" || state === "failed") return <Minus aria-hidden className="size-4 text-warning" strokeWidth={2.4} />;
  return (
    <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} aria-hidden>
      <Check className={cn("size-4", state === "partial" ? "text-warning" : "text-success")} strokeWidth={2.4} />
    </motion.span>
  );
}
