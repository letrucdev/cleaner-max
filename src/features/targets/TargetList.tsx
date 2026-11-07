import { groupBy, maxBy, sumBy } from "lodash-es";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SelectionBar } from "@/components/app/SelectionBar";
import { EmptyState, ErrorState, ListSkeleton, PartialErrors } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTargets, type Target } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { itemVariants, listVariants } from "@/lib/motion";
import { cleanable } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

export type PlatformFilter = "all" | "wsl" | "windows";

interface Props {
  category: Target["category"];
  filter?: PlatformFilter;
  emptyText: string;
  /** Hide the group heading when there is a single group (the page already titles it). */
  hideSingleGroupTitle?: boolean;
}

function hint(t: Target): string {
  return t.command ?? t.paths.join(" · ");
}

/** Selectable list of registry targets grouped by platform/distro, with a floating action bar. */
export function TargetList({ category, filter = "all", emptyText, hideSingleGroupTitle = false }: Props) {
  const { t } = useTranslation();
  const query = useTargets();
  const openClean = useUi((s) => s.openClean);

  const all = useMemo(() => (query.data?.targets ?? []).filter((x) => x.category === category), [query.data, category]);
  const visible = useMemo(() => all.filter((x) => filter === "all" || x.platform === filter), [all, filter]);

  // Everything cleanable starts selected; the user unticks what to keep.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  useEffect(() => setDeselected(new Set()), [query.dataUpdatedAt]);
  const isOn = (x: Target) => cleanable(x) && !deselected.has(x.id);

  const selected = visible.filter(isOn);
  const selectedBytes = sumBy(selected, (x) => x.size ?? 0);
  const maxSize = maxBy(visible, (x) => x.size ?? 0)?.size ?? 1;

  const groups = useMemo(() => {
    const by = groupBy(visible, (x) => (x.platform === "windows" ? "windows" : `wsl:${x.distro}`));
    return Object.entries(by)
      .sort(([a], [b]) => (a === "windows" ? -1 : b === "windows" ? 1 : a.localeCompare(b)))
      .map(([key, items]) => ({
        key,
        title: key === "windows" ? t("common.windows") : t("caches.groupWsl", { distro: key.slice(4) }),
        items,
        total: sumBy(items, (x) => x.size ?? 0),
      }));
  }, [visible, t]);

  const toggle = (id: string, on: boolean) =>
    setDeselected((d) => {
      const n = new Set(d);
      if (on) n.delete(id);
      else n.add(id);
      return n;
    });

  const allSelected = visible.filter(cleanable).every(isOn);
  const toggleAll = () => setDeselected(allSelected ? new Set(visible.map((x) => x.id)) : new Set());

  const review = () => {
    openClean(
      selected.map((x) => ({
        item: { kind: "target", id: x.id },
        label: t(`targets.${x.defId}`, { defaultValue: x.defId }),
        where: x.platform === "wsl" ? t("clean.wsl") : t("clean.windows"),
        size: x.size,
      })),
      visible
        .filter((x) => x.blockedBy)
        .map((x) => ({ label: t(`targets.${x.defId}`, { defaultValue: x.defId }), reason: t("caches.blocked", { process: x.blockedBy }), size: x.size })),
    );
  };

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <ListSkeleton rows={6} />;

  return (
    <>
      <div className="flex flex-col gap-5 pb-28">
        <PartialErrors errors={query.data.errors} />
        {groups.length === 0 && <EmptyState text={emptyText} />}
        {groups.map((g) => (
          <motion.section key={g.key} variants={itemVariants} className="flex flex-col gap-2" aria-label={g.title}>
            {!(hideSingleGroupTitle && groups.length === 1) && (
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-semibold text-muted-foreground">{g.title}</h2>
                <span className="tabular text-[12px] text-muted-foreground">{formatBytes(g.total)}</span>
              </div>
            )}
            <motion.ul variants={listVariants} className="overflow-hidden rounded-2xl border bg-card shadow-card">
              {g.items.map((x) => {
                const name = t(`targets.${x.defId}`, { defaultValue: x.defId });
                const disabled = !cleanable(x);
                const id = `t-${x.id}`;
                return (
                  <motion.li variants={itemVariants} key={x.id} className={cn("border-t first:border-t-0", disabled && "opacity-60")}>
                    <label htmlFor={id} className={cn("flex min-h-13 items-center gap-3 px-4 py-1.5", !disabled && "cursor-pointer")}>
                      <Checkbox id={id} checked={isOn(x)} disabled={disabled} onCheckedChange={(v) => toggle(x.id, v === true)} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[13px] font-medium">{name}</span>
                        <span className="truncate text-[12px] text-muted-foreground" title={hint(x)}>
                          {hint(x)}
                        </span>
                      </span>
                      {x.blockedBy && (
                        <span className="rounded-full bg-warning-soft px-2 py-0.75 text-[12px] font-semibold whitespace-nowrap text-warning">
                          {t("caches.blocked", { process: x.blockedBy })}
                        </span>
                      )}
                      <span aria-hidden className="hidden h-1 w-30 shrink-0 overflow-hidden rounded-full bg-track sm:block">
                        <motion.span
                          className="block h-full origin-left rounded-full bg-primary"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.max(0.03, (x.size ?? 0) / maxSize) }}
                          transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                        />
                      </span>
                      <span className="tabular min-w-20 text-right text-[13px] font-semibold whitespace-nowrap">
                        {x.size === null ? <span className="font-normal text-muted-foreground">{t("caches.measuredAfter")}</span> : formatBytes(x.size)}
                      </span>
                    </label>
                  </motion.li>
                );
              })}
            </motion.ul>
          </motion.section>
        ))}
      </div>

      <SelectionBar visible={selected.length > 0} label={t("caches.selected", { count: selected.length })} bytes={selectedBytes}>
        <Button variant="outline" onClick={toggleAll} className="h-9 rounded-[9px] bg-card px-3.5 text-[13px]">
          {allSelected ? t("common.deselectAll") : t("common.selectAll")}
        </Button>
        <Button onClick={review} className="h-9 rounded-[9px] px-4.5 text-[13px] font-semibold">
          {t("common.previewClean")}
        </Button>
      </SelectionBar>
    </>
  );
}
