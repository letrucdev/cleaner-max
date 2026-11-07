import { format, isToday, isYesterday } from "date-fns";
import { groupBy, sumBy } from "lodash-es";
import { Check, ChevronDown, Minimize2, Minus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AnimatedBytes } from "@/components/app/AnimatedBytes";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/app/States";
import { useHistory, type CleanReport, type ItemResult } from "@/lib/api";
import { baseName, formatBytes, formatDate } from "@/lib/format";
import { itemVariants, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Human label for a result key (target id, `artifact:…` or `admin:…`). */
export function resultLabel(key: string, t: TFunction): string {
  if (key.startsWith("admin:")) {
    const [, kind, ...rest] = key.split(":");
    const arg = rest.join(":");
    switch (kind) {
      case "compact":
        return arg.toLowerCase().includes("docker") ? t("system.compactDocker") : `${t("system.compact")} ${baseName(arg)}`;
      case "sparse":
        return t("system.sparse", { distro: arg });
      case "docker-prune":
        return t("system.dockerPrune");
      case "hibernate-off":
        return t("system.hibernate");
      case "dism":
        return t("system.dism");
    }
  }
  if (key.startsWith("artifact:")) {
    const parts = key.split(/[\\/]/).filter(Boolean);
    return parts.slice(-2).join(" / ");
  }
  const [defId, distro] = key.split("@");
  const name = t(`targets.${defId}`, { defaultValue: defId });
  return distro ? `${name} (WSL)` : name;
}

function dayLabel(ms: number, t: TFunction) {
  const d = new Date(ms);
  if (isToday(d)) return `${t("history.today")} — ${formatDate(ms)}`;
  if (isYesterday(d)) return `${t("history.yesterday")} — ${formatDate(ms)}`;
  return formatDate(ms);
}

function StatusIcon({ r }: { r: ItemResult }) {
  if (r.status === "done") return <Check aria-hidden className="size-3 text-success" strokeWidth={2.6} />;
  if (r.status === "partial") return <Check aria-hidden className="size-3 text-warning" strokeWidth={2.6} />;
  if (r.status === "failed") return <X aria-hidden className="size-3 text-destructive" strokeWidth={2.6} />;
  return <Minus aria-hidden className="size-3 text-warning" strokeWidth={2.6} />;
}

function RunRow({ run, first }: { run: CleanReport; first: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(first);
  const admin = run.results.length === 1 && run.results[0].key.startsWith("admin:");
  const skipped = run.results.filter((r) => r.status === "skipped").length;
  const failed = run.results.filter((r) => r.status === "failed").length;
  const meta = [
    format(new Date(run.startedAt), "HH:mm"),
    t("history.items", { count: run.results.length }),
    skipped ? t("history.skipped", { count: skipped }) : null,
    failed ? t("history.failed", { count: failed }) : null,
  ].filter(Boolean);
  const Icon = admin ? Minimize2 : Trash2;

  return (
    <li className={cn(!first && "border-t")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-15 w-full items-center gap-3.5 px-4 py-2 text-left outline-none focus-visible:bg-fill"
      >
        <div aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px]", admin ? "bg-primary/10" : "bg-success-soft")}>
          <Icon className={cn("size-4.5", admin ? "text-accent-text" : "text-success")} strokeWidth={2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold">{admin ? resultLabel(run.results[0].key, t) : t("history.cleanRun")}</span>
          <span className="text-[12px] text-muted-foreground">{meta.join(" · ")}</span>
        </div>
        <span className={cn("tabular text-[15px] font-bold", admin ? "text-accent-text" : "text-success")}>+{formatBytes(run.freed)}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} aria-hidden>
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={spring}
          >
            <ul className="flex flex-col gap-1.5 pr-4 pb-3 pl-16.5">
              {run.results.map((r) => (
                <li key={r.key} className="flex items-start justify-between gap-3 text-[12px] text-muted-foreground">
                  <span className="flex min-w-0 items-start gap-1.5">
                    <span className="mt-0.75">
                      <StatusIcon r={r} />
                    </span>
                    <span className="min-w-0">
                      <span className="text-foreground">{resultLabel(r.key, t)}</span>
                      {r.message && r.status !== "done" && <span className="block wrap-break-word whitespace-pre-line">{r.message}</span>}
                    </span>
                  </span>
                  <span className="tabular shrink-0">{r.freed > 0 ? formatBytes(r.freed) : ""}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function HistoryPage() {
  const { t } = useTranslation();
  const history = useHistory();
  const runs = history.data ?? [];
  const days = Object.entries(groupBy(runs, (r) => format(new Date(r.startedAt), "yyyy-MM-dd")));

  return (
    <>
      <PageHeader
        title={t("history.title")}
        subtitle={t("history.subtitle")}
        actions={
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[12px] text-muted-foreground">{t("history.total")}</span>
            <AnimatedBytes value={sumBy(runs, "freed")} className="text-[26px] font-bold tracking-[-0.02em]" />
          </div>
        }
      />
      <div className="flex max-w-230 flex-col gap-5 px-8 pt-5 pb-8">
        {history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : history.isPending ? (
          <ListSkeleton rows={4} />
        ) : runs.length === 0 ? (
          <EmptyState text={t("history.empty")} />
        ) : (
          days.map(([day, dayRuns]) => (
            <motion.section key={day} variants={itemVariants} className="flex flex-col gap-2" aria-label={dayLabel(dayRuns[0].startedAt, t)}>
              <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">{dayLabel(dayRuns[0].startedAt, t)}</h2>
              <ul className="overflow-hidden rounded-2xl border bg-card shadow-card">
                {dayRuns.map((run, i) => (
                  <RunRow key={run.startedAt} run={run} first={i === 0} />
                ))}
              </ul>
            </motion.section>
          ))
        )}
      </div>
    </>
  );
}
