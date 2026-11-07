import { ChartPie, Clock, Folder, HardDrive, Package, ShieldCheck, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useOverview } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { springSnappy } from "@/lib/motion";
import { systemDrive, useCleanupTotals } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useUi, type PageId } from "@/stores/ui";

interface NavItem {
  id: PageId;
  icon: LucideIcon;
  badge?: number;
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  const { t } = useTranslation();
  const setPage = useUi((s) => s.setPage);
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => setPage(item.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "font-semibold" : "font-medium hover:bg-sidebar-accent/60",
      )}
    >
      {active && (
        <motion.span layoutId="nav-active" transition={springSnappy} className="absolute inset-0 rounded-lg bg-sidebar-accent" />
      )}
      <Icon className={cn("relative size-4.25", active ? "text-accent-text" : "text-muted-foreground")} strokeWidth={1.8} aria-hidden />
      <span className="relative min-w-0 flex-1 truncate">{t(`nav.${item.id}`)}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="tabular relative shrink-0 text-[12px] font-normal text-muted-foreground">{formatBytes(item.badge)}</span>
      )}
    </button>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const page = useUi((s) => s.page);
  const totals = useCleanupTotals();
  const overview = useOverview();
  const drive = systemDrive(overview.data);

  const clean: NavItem[] = [
    { id: "overview", icon: ChartPie },
    { id: "caches", icon: Package, badge: totals.caches.bytes },
    { id: "projects", icon: Folder, badge: totals.projects.bytes },
    { id: "system", icon: ShieldCheck, badge: totals.junk.bytes },
  ];
  const other: NavItem[] = [
    { id: "history", icon: Clock },
    { id: "settings", icon: SlidersHorizontal },
  ];

  const usedPct = drive ? Math.round(((drive.total - drive.available) / drive.total) * 100) : 0;

  return (
    <aside className="flex w-62 shrink-0 flex-col gap-3.5 border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <div className="flex size-8 items-center justify-center rounded-[9px] bg-primary" aria-hidden>
          <HardDrive className="size-4.5 text-white" strokeWidth={2} />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold tracking-[-0.01em]">{t("app.name")}</span>
          <span className="text-[11px] text-muted-foreground">{t("app.tagline")}</span>
        </div>
      </div>

      <nav aria-label={t("app.name")} className="flex flex-col gap-0.5">
        <span className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">{t("nav.groupClean")}</span>
        {clean.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} />
        ))}
        <span className="px-2.5 pt-3.5 pb-1 text-[11px] font-semibold text-muted-foreground">{t("nav.groupOther")}</span>
        {other.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} />
        ))}
      </nav>

      {drive && (
        <div className="mt-auto flex flex-col gap-2 rounded-xl border bg-card p-3">
          <div className="flex justify-between text-[12px]">
            <span className="font-semibold">{drive.mount.replace(/\\$/, "")}</span>
            <span className="text-muted-foreground">{t("common.free", { size: formatBytes(drive.available) })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-track">
            <motion.div
              className={cn("h-full origin-left rounded-full", usedPct > 85 ? "bg-warning-fill" : "bg-primary")}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: usedPct / 100 }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {t("common.usedOf", { used: formatBytes(drive.total - drive.available, 0), total: formatBytes(drive.total, 0), pct: usedPct })}
          </span>
        </div>
      )}
    </aside>
  );
}
