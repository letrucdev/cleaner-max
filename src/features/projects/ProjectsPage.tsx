import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { sumBy } from "lodash-es";
import { ArrowDown, ArrowUp, Folder, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";
import { SelectionBar } from "@/components/app/SelectionBar";
import { Segmented } from "@/components/app/Segmented";
import { EmptyState, ErrorState, ListSkeleton, PartialErrors } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Project } from "@/lib/api";
import { formatBytes, formatDate, formatRelative } from "@/lib/format";
import { itemVariants, spring } from "@/lib/motion";
import { isStale, useProjectRoots, useProjectScan } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
});
const helper = createColumnHelper<typeof features, Project>();
const columns = helper.columns([
  helper.accessor("name", { id: "name", sortFn: "alphanumeric" }),
  helper.accessor("lastModified", { id: "lastModified", sortFn: "basic" }),
  helper.accessor("size", { id: "size", sortFn: "basic" }),
]);
const EMPTY: Project[] = [];

function RootChips({ roots }: { roots: string[] }) {
  const { t } = useTranslation();
  const setRoots = useSettings((s) => s.setProjectRoots);

  async function add() {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string" && !roots.includes(picked)) setRoots([...roots, picked]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-8 pt-4">
      <span className="text-[12px] text-muted-foreground">{t("projects.roots")}</span>
      <AnimatePresence initial={false}>
        {roots.map((r) => (
          <motion.span
            key={r}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={spring}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card pr-1 pl-2.5 text-[12px]"
          >
            <Folder className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="max-w-90 truncate" title={r}>
              {r}
            </span>
            <button
              type="button"
              aria-label={t("projects.removeRoot", { path: r })}
              onClick={() => setRoots(roots.filter((x) => x !== r))}
              className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-fill hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => void add()}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-muted-foreground/60 px-2.5 text-[12px] font-medium text-accent-text hover:bg-fill"
      >
        <Plus className="size-3.5" aria-hidden /> {t("projects.addRoot")}
      </button>
    </div>
  );
}

function SortHeader({ label, sorted, onClick, align = "left" }: { label: string; sorted: false | "asc" | "desc"; onClick: () => void; align?: "left" | "right" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 font-medium hover:text-foreground", align === "right" && "flex-row-reverse")}
    >
      {label}
      {sorted === "asc" && <ArrowUp className="size-3" aria-hidden />}
      {sorted === "desc" && <ArrowDown className="size-3" aria-hidden />}
    </button>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const roots = useProjectRoots();
  const scan = useProjectScan();
  const staleDays = useSettings((s) => s.staleDays);
  const setStaleDays = useSettings((s) => s.setStaleDays);
  const openClean = useUi((s) => s.openClean);

  const data = scan.data?.projects ?? EMPTY;
  const table = useTable({ features, columns, data, initialState: { sorting: [{ id: "size", desc: true }] } });

  // Stale projects start selected; `flipped` records the user's deviations from that default.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  useEffect(() => setFlipped(new Set()), [scan.dataUpdatedAt, staleDays]);
  const isOn = (p: Project) => !p.active && (isStale(p, staleDays) !== flipped.has(p.path));
  const toggle = (p: Project) =>
    setFlipped((f) => {
      const n = new Set(f);
      if (n.has(p.path)) n.delete(p.path);
      else n.add(p.path);
      return n;
    });

  const selected = useMemo(() => data.filter(isOn), [data, flipped, staleDays]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedBytes = sumBy(selected, "size");

  const review = () =>
    openClean(
      selected.flatMap((p) =>
        p.artifacts.map((a) => ({
          item: { kind: "artifact" as const, platform: p.platform, distro: p.distro, path: a.path },
          label: `${p.name} / ${a.name}`,
          where: p.platform === "wsl" ? t("clean.wsl") : t("clean.windows"),
          size: a.size,
        })),
      ),
    );

  const sortState = (id: string) => table.getColumn(id)?.getIsSorted() ?? false;
  const toggleSort = (id: string) => table.getColumn(id)?.toggleSorting();

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        actions={
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] text-muted-foreground">{t("projects.olderThan")}</span>
            <Segmented
              label={t("projects.olderThan")}
              value={String(staleDays)}
              onChange={(v) => setStaleDays(Number(v))}
              options={[30, 90, 180].map((d) => ({ value: String(d), label: t("projects.days", { count: d }) }))}
            />
          </div>
        }
      />
      <RootChips roots={roots} />
      <div className="px-8 pt-4 pb-28">
        {roots.length === 0 ? (
          <EmptyState text={t("projects.noRoots")} />
        ) : scan.isError ? (
          <ErrorState error={scan.error} onRetry={() => void scan.refetch()} />
        ) : scan.isPending ? (
          <ListSkeleton rows={7} />
        ) : (
          <div className="flex flex-col gap-4">
            <PartialErrors errors={scan.data.errors} />
            {data.length === 0 ? (
              <EmptyState text={t("projects.empty")} />
            ) : (
              <motion.div variants={itemVariants} className="overflow-x-auto rounded-2xl border bg-card shadow-card">
                <table className="w-full min-w-180 border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[12px] text-muted-foreground">
                      <th scope="col" className="w-11 py-3 pl-4">
                        <span className="sr-only">{t("projects.select", { name: "" })}</span>
                      </th>
                      <th scope="col" className="px-2 py-3">
                        <SortHeader label={t("projects.colProject")} sorted={sortState("name")} onClick={() => toggleSort("name")} />
                      </th>
                      <th scope="col" className="px-2 py-3">
                        <SortHeader label={t("projects.colModified")} sorted={sortState("lastModified")} onClick={() => toggleSort("lastModified")} />
                      </th>
                      <th scope="col" className="px-2 py-3 font-medium">
                        {t("projects.colArtifacts")}
                      </th>
                      <th scope="col" className="py-3 pr-4 pl-2 text-right">
                        <SortHeader align="right" label={t("projects.colSize")} sorted={sortState("size")} onClick={() => toggleSort("size")} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => {
                      const p = row.original;
                      const id = `p-${p.path}`;
                      return (
                        <motion.tr layout="position" transition={spring} key={row.id} className={cn("border-t", p.active && "opacity-60")}>
                          <td className="py-3 pl-4">
                            <Checkbox id={id} aria-label={t("projects.select", { name: p.name })} checked={isOn(p)} disabled={p.active} onCheckedChange={() => toggle(p)} />
                          </td>
                          <td className="px-2 py-2.5">
                            <label htmlFor={id} className="flex flex-col gap-0.5">
                              <span className="font-semibold">{p.name}</span>
                              <span className="max-w-85 truncate text-[12px] text-muted-foreground" title={p.path}>
                                {p.distro ? `${p.distro}: ${p.path}` : p.path}
                              </span>
                            </label>
                          </td>
                          <td className="px-2 py-2.5 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span>{formatRelative(p.lastModified)}</span>
                              <span className="text-[12px] text-muted-foreground">{formatDate(p.lastModified)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {p.artifacts.map((a) => (
                                <span key={a.path} title={formatBytes(a.size)} className="rounded-md bg-fill px-2 py-0.5 font-mono text-[12px] whitespace-nowrap">
                                  {a.name}
                                </span>
                              ))}
                              {p.active && (
                                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">{t("projects.active")}</span>
                              )}
                            </div>
                          </td>
                          <td className="tabular py-2.5 pr-4 pl-2 text-right font-semibold whitespace-nowrap">{formatBytes(p.size)}</td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <SelectionBar visible={selected.length > 0} label={t("projects.selected", { count: selected.length })} bytes={selectedBytes}>
        <Button onClick={review} className="h-9 rounded-[9px] px-4.5 text-[13px] font-semibold">
          {t("common.previewClean")}
        </Button>
      </SelectionBar>
    </>
  );
}
