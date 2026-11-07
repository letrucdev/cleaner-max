import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, HardDrive, Moon, Package, RefreshCw, Sparkles, Trash2, Folder, Container, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { AnimatedBytes } from "@/components/app/AnimatedBytes";
import { PageHeader } from "@/components/app/PageHeader";
import { ErrorState } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverview, type Overview } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import { itemVariants, listVariants } from "@/lib/motion";
import { systemDrive, useCleanupTotals } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { useUi, type PageId } from "@/stores/ui";
import { DonutChart, type DonutSegment } from "./DonutChart";

const card = "rounded-2xl border bg-card shadow-card";

type Tone = "green" | "orange" | "gray";
const pillTone: Record<Tone, string> = {
  green: "bg-success-soft text-success",
  orange: "bg-warning-soft text-warning",
  gray: "bg-fill text-muted-foreground",
};

interface Cause {
  key: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  pill: string;
  tone: Tone;
  size: number;
}

function useCauses(o: Overview | undefined): Cause[] {
  const { t } = useTranslation();
  if (!o) return [];
  const causes: Cause[] = o.virtualDisks.map((d) => ({
    key: d.path,
    icon: d.kind === "dockerData" ? Container : HardDrive,
    title: d.kind === "dockerData" ? t("overview.docker") : t("overview.wslDistro", { name: d.owner }),
    sub: `${d.path.split("\\").pop()} · ${d.sparse ? t("overview.sparseHint") : t("overview.notSparseHint")}`,
    pill: d.sparse ? t("overview.sparse") : t("overview.compressible"),
    tone: d.sparse ? "green" : "orange",
    size: d.size,
  }));
  if (o.hiberfil) {
    causes.push({ key: "hiberfil", icon: Moon, title: t("overview.hibernate"), sub: `${o.systemDrive}\\hiberfil.sys`, pill: t("overview.hibernateOn"), tone: "gray", size: o.hiberfil });
  }
  if (o.recycleBin.size > 0) {
    causes.push({
      key: "recycle",
      icon: Trash2,
      title: t("overview.recycleBin"),
      sub: "$Recycle.Bin",
      pill: t("overview.recycleItems", { count: o.recycleBin.items }),
      tone: "gray",
      size: o.recycleBin.size,
    });
  }
  return causes.sort((a, b) => b.size - a.size);
}

function DriveCard({ o }: { o: Overview }) {
  const { t } = useTranslation();
  const drive = systemDrive(o);
  if (!drive) return null;
  const used = drive.total - drive.available;
  const onDrive = (p: string) => p.toUpperCase().startsWith(drive.mount.slice(0, 2).toUpperCase());
  const vdisks = o.virtualDisks.filter((d) => onDrive(d.path)).reduce((s, d) => s + d.size, 0);
  const hiber = o.hiberfil ?? 0;
  const recycle = o.recycleBin.size;
  const segments: (DonutSegment & { label: string })[] = [
    { key: "vdisks", value: vdisks, color: "var(--chart-1)", label: t("overview.seg.vdisks") },
    { key: "hiberfil", value: hiber, color: "var(--chart-2)", label: t("overview.seg.hiberfil") },
    { key: "recycle", value: recycle, color: "var(--chart-5)", label: t("overview.seg.recycle") },
    { key: "other", value: Math.max(used - vdisks - hiber - recycle, 0), color: "var(--chart-3)", label: t("overview.seg.other") },
  ];
  const mount = drive.mount.replace(/\\$/, "");

  return (
    <motion.section variants={itemVariants} aria-labelledby="h-drive" className={cn(card, "flex flex-col gap-4 p-5")}>
      <div className="flex items-baseline justify-between">
        <h2 id="h-drive" className="text-[15px] font-semibold">
          {t("overview.drive", { mount })}
        </h2>
        <span className="text-[12px] text-muted-foreground">
          {formatBytes(drive.total, 0)} · {drive.fileSystem}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <DonutChart
          segments={segments}
          total={drive.total}
          label={t("overview.driveChart", { mount, used: formatBytes(used), total: formatBytes(drive.total) })}
        >
          <AnimatedBytes value={drive.available} className="text-[26px] font-bold tracking-[-0.02em]" />
          <span className="text-[12px] text-muted-foreground">{t("overview.freeLabel")}</span>
        </DonutChart>
        <ul className="flex min-w-50 flex-1 flex-col gap-2.5">
          {[...segments.filter((s) => s.value > 0), { key: "free", value: drive.available, color: "var(--track)", label: t("overview.seg.free") }].map((s) => (
            <li key={s.key} className="flex items-center gap-2.5 text-[13px]">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="min-w-0 flex-1">{s.label}</span>
              <span className="tabular text-muted-foreground">{formatBytes(s.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}

function CausesCard({ o }: { o: Overview }) {
  const { t } = useTranslation();
  const causes = useCauses(o);
  return (
    <motion.section variants={itemVariants} aria-labelledby="h-causes" className={cn(card, "flex flex-col px-5 pt-5 pb-2")}>
      <div className="flex items-baseline justify-between pb-2">
        <h2 id="h-causes" className="text-[15px] font-semibold">
          {t("overview.causes")}
        </h2>
        <span className="text-[12px] text-muted-foreground">{t("overview.causesHint")}</span>
      </div>
      {causes.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">{t("overview.causesEmpty")}</p>}
      <motion.ul variants={listVariants}>
        {causes.map((c) => {
          const Icon = c.icon;
          return (
            <motion.li variants={itemVariants} key={c.key} className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
              <div aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-fill">
                <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.9} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-semibold">{c.title}</span>
                <span className="truncate text-[12px] text-muted-foreground">{c.sub}</span>
              </div>
              <span className={cn("rounded-full px-2 py-0.75 text-[12px] font-semibold whitespace-nowrap", pillTone[c.tone])}>{c.pill}</span>
              <span className="tabular w-18 text-right text-[14px] font-semibold">{formatBytes(c.size)}</span>
            </motion.li>
          );
        })}
      </motion.ul>
    </motion.section>
  );
}

function ReadyCard({ icon: Icon, title, sub, bytes, loading, page }: { icon: LucideIcon; title: string; sub: string; bytes: number; loading: boolean; page: PageId }) {
  const setPage = useUi((s) => s.setPage);
  return (
    <motion.button
      type="button"
      variants={itemVariants}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
      onClick={() => setPage(page)}
      className={cn(card, "flex flex-col gap-2.5 px-5 py-4.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      <span className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2">
          <Icon className="size-4.5 text-accent-text" strokeWidth={1.9} aria-hidden />
          <span className="text-[13px] font-semibold">{title}</span>
        </span>
        <ChevronRight className="size-3.5 text-muted-foreground" strokeWidth={2.2} aria-hidden />
      </span>
      {loading ? <Skeleton className="h-9 w-32" /> : <AnimatedBytes value={bytes} className="text-[30px] font-bold tracking-[-0.02em]" />}
      <span className="text-[12px] text-muted-foreground">{sub}</span>
    </motion.button>
  );
}

function DrivesCard({ o }: { o: Overview }) {
  const { t } = useTranslation();
  const disks = [...o.disks].sort((a, b) => a.mount.localeCompare(b.mount));
  return (
    <motion.section variants={itemVariants} aria-labelledby="h-drives" className={cn(card, "flex flex-col gap-3.5 p-5")}>
      <h2 id="h-drives" className="text-[15px] font-semibold">
        {t("overview.drives")}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-x-8 gap-y-3.5">
        {disks.map((d, i) => {
          const pct = (d.total - d.available) / d.total;
          return (
            <div key={d.mount} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2 text-[13px]">
                <span className="truncate font-semibold">
                  {d.mount.replace(/\\$/, "")} {d.label && <span className="font-normal text-muted-foreground">{d.label}</span>}
                </span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {t("overview.driveFreeOf", { free: formatBytes(d.available, 0), total: formatBytes(d.total, 0) })}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-track">
                <motion.div
                  className={cn("h-full origin-left rounded-full", pct > 0.85 ? "bg-warning-fill" : "bg-primary")}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: pct }}
                  transition={{ type: "spring", bounce: 0, duration: 0.5, delay: 0.04 * i }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5">
      <Skeleton className="h-65 rounded-2xl" />
      <Skeleton className="h-65 rounded-2xl" />
    </div>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const overview = useOverview();
  const totals = useCleanupTotals();
  const queryClient = useQueryClient();
  const setPage = useUi((s) => s.setPage);
  const staleDays = useSettings((s) => s.staleDays);
  const fetching = overview.isFetching;

  const rescan = () => {
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["targets"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <>
      <PageHeader
        title={t("overview.title")}
        subtitle={overview.dataUpdatedAt ? t("overview.subtitle", { time: formatRelative(overview.dataUpdatedAt) }) : t("common.scanning")}
        actions={
          <>
            <Button variant="outline" onClick={rescan} disabled={fetching} className="h-9 rounded-[9px] bg-card px-3.5 text-[13px]">
              <RefreshCw className={cn(fetching && "animate-spin")} /> {t("common.rescan")}
            </Button>
            <Button onClick={() => setPage("caches")} className="h-9 rounded-[9px] px-4 text-[13px] font-semibold">
              <Sparkles /> {t("overview.cleanSuggested")}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5 px-8 pt-6 pb-8">
        {overview.isError ? (
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        ) : !overview.data ? (
          <OverviewSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5">
              <DriveCard o={overview.data} />
              <CausesCard o={overview.data} />
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
              <ReadyCard
                icon={Package}
                page="caches"
                title={t("overview.ready.caches")}
                sub={t("overview.ready.cachesSub", { count: totals.caches.count })}
                bytes={totals.caches.bytes}
                loading={totals.caches.loading}
              />
              <ReadyCard
                icon={Folder}
                page="projects"
                title={t("overview.ready.projects")}
                sub={t("overview.ready.projectsSub", { count: totals.projects.count, days: staleDays })}
                bytes={totals.projects.bytes}
                loading={totals.projects.loading}
              />
              <ReadyCard
                icon={Trash2}
                page="system"
                title={t("overview.ready.junk")}
                sub={t("overview.ready.junkSub")}
                bytes={totals.junk.bytes}
                loading={totals.junk.loading}
              />
            </div>
            <DrivesCard o={overview.data} />
          </>
        )}
      </div>
    </>
  );
}
