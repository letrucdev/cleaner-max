import { Channel } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/stores/settings";
import {
  commands,
  type AdminTask,
  type Category,
  type CleanEvent_Deserialize,
  type CleanItem_Deserialize,
  type CleanReport_Serialize,
} from "./bindings";

// Data coming from Rust uses the `_Serialize` shapes; data sent to Rust the `_Deserialize` ones.
export type {
  AdminTask,
  AppInfo,
  Artifact,
  CleanItem_Deserialize as CleanItem,
  CleanReport_Serialize as CleanReport,
  DiskInfo,
  ItemResult_Serialize as ItemResult,
  ItemStatus,
  Overview_Serialize as Overview,
  Project_Serialize as Project,
  Target_Serialize as Target,
  VirtualDisk,
} from "./bindings";
export type CleanEvent = CleanEvent_Deserialize;

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: string };

/** tauri-specta returns `{ status, data | error }`; React Query wants a throwing promise. */
async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (r.status === "error") throw new Error(r.error);
  return r.data;
}

export const api = {
  appInfo: () => unwrap(commands.getAppInfo()),
  overview: () => unwrap(commands.getOverview()),
  targets: (category: Category | null = null) => unwrap(commands.scanTargets(category)),
  projects: (roots: string[], activeDays: number) => unwrap(commands.scanProjects(roots, activeDays)),
  history: (limit = 100) => unwrap(commands.getHistory(limit)),
  /** Clean (or measure, with `dryRun`) and stream progress events. */
  clean: (items: CleanItem_Deserialize[], dryRun: boolean, onEvent: (e: CleanEvent) => void): Promise<CleanReport_Serialize> => {
    const channel = new Channel<CleanEvent_Deserialize>();
    channel.onmessage = onEvent;
    return unwrap(commands.clean(items, dryRun, useSettings.getState().recordHistory, channel));
  },
  /** One UAC-elevated (or WSL/Docker-restarting) task. A declined prompt resolves as `skipped`. */
  adminTask: (task: AdminTask) => unwrap(commands.runAdminTask(task, useSettings.getState().recordHistory)),
  /** Show a folder in File Explorer (`distro` for a Linux path inside WSL). */
  openFolder: (path: string, distro: string | null = null) => unwrap(commands.openFolder(path, distro)),
};

export const queryKeys = {
  appInfo: ["app-info"] as const,
  overview: ["overview"] as const,
  targets: ["targets"] as const,
  projects: (roots: string[], activeDays: number) => ["projects", roots, activeDays] as const,
  history: ["history"] as const,
};

export const useAppInfo = () => useQuery({ queryKey: queryKeys.appInfo, queryFn: api.appInfo, staleTime: Infinity });

export const useOverview = () => useQuery({ queryKey: queryKeys.overview, queryFn: api.overview });

export const useTargets = () => useQuery({ queryKey: queryKeys.targets, queryFn: () => api.targets(null) });

export const useHistory = () => useQuery({ queryKey: queryKeys.history, queryFn: () => api.history(200) });

export const useProjects = (roots: string[], activeDays: number) =>
  useQuery({
    queryKey: queryKeys.projects(roots, activeDays),
    queryFn: () => api.projects(roots, activeDays),
    enabled: roots.length > 0,
  });
