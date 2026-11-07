import { sumBy } from "lodash-es";
import { useMemo } from "react";
import { useAppInfo, useProjects, useTargets, type CleanItem, type Overview, type Project, type Target } from "./api";
import { useSettings } from "@/stores/settings";

/** Same key the backend uses in progress events (`CleanItem::key`). */
export function itemKey(item: CleanItem): string {
  if (item.kind === "target") return item.id;
  return item.distro ? `artifact:${item.distro}:${item.path}` : `artifact:${item.path}`;
}

/** Folders to scan for projects: the user's list, or the backend's suggestions. */
export function useProjectRoots(): string[] {
  const roots = useSettings((s) => s.projectRoots);
  const info = useAppInfo();
  return roots ?? info.data?.defaultProjectRoots ?? [];
}

export function useProjectScan() {
  const roots = useProjectRoots();
  const activeDays = useSettings((s) => s.activeDays);
  return useProjects(roots, activeDays);
}

export const DAY_MS = 86_400_000;

/** Old enough to be pre-selected: not active and untouched for `staleDays`. */
export function isStale(p: Project, staleDays: number): boolean {
  return !p.active && Date.now() - p.lastModified > staleDays * DAY_MS;
}

export const cleanable = (t: Target) => !t.blockedBy && (t.size === null || t.size > 0);

/** Totals for the sidebar badges and the overview's "ready to clean" cards. */
export function useCleanupTotals() {
  const targets = useTargets();
  const projects = useProjectScan();
  const staleDays = useSettings((s) => s.staleDays);
  return useMemo(() => {
    const list = targets.data?.targets ?? [];
    const caches = list.filter((t) => t.category === "devCache");
    const junk = list.filter((t) => t.category === "windowsJunk");
    const stale = (projects.data?.projects ?? []).filter((p) => isStale(p, staleDays));
    return {
      caches: { bytes: sumBy(caches, (t) => t.size ?? 0), count: caches.length, loading: targets.isPending },
      junk: { bytes: sumBy(junk, (t) => t.size ?? 0), count: junk.length, loading: targets.isPending },
      projects: { bytes: sumBy(stale, "size"), count: stale.length, loading: projects.isPending && projects.fetchStatus !== "idle" },
    };
  }, [targets.data, targets.isPending, projects.data, projects.isPending, projects.fetchStatus, staleDays]);
}

/** The Windows system drive (where WSL/Docker disks live). */
export function systemDrive(o: Overview | undefined) {
  return o?.disks.find((d) => d.mount.toUpperCase().startsWith("C:")) ?? o?.disks[0];
}
