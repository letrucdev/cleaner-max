/**
 * Browser-only IPC mock (`npm run dev` outside Tauri). Lets the UI be developed and screenshotted
 * in a normal browser. Data is modelled on a real scan of the development machine.
 * Never bundled into the Tauri app: main.tsx only imports it when Tauri is absent.
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Channel } from "@tauri-apps/api/core";
import type {
  AppInfo,
  CleanEvent_Deserialize,
  CleanItem_Deserialize,
  CleanReport_Serialize,
  ItemResult_Serialize,
  Overview_Serialize,
  ProjectScan_Serialize,
  Target_Serialize,
  TargetScan_Serialize,
} from "@/lib/bindings";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const DAY = 86_400_000;
const now = Date.now();
const DISTRO = "Ubuntu-24.04";

const overview: Overview_Serialize = {
  disks: [
    { mount: "C:\\", label: "", fileSystem: "NTFS", total: 249 * GB, available: 35 * GB },
    { mount: "D:\\", label: "HDD Data", fileSystem: "NTFS", total: 465.8 * GB, available: 270.4 * GB },
    { mount: "E:\\", label: "HDD Game", fileSystem: "NTFS", total: 931.5 * GB, available: 487.3 * GB },
    { mount: "F:\\", label: "HDD Backup", fileSystem: "NTFS", total: 465.8 * GB, available: 278.1 * GB },
    { mount: "G:\\", label: "NVME 2", fileSystem: "NTFS", total: 931.5 * GB, available: 224 * GB },
    { mount: "H:\\", label: "NVME Game", fileSystem: "NTFS", total: 681.5 * GB, available: 229.3 * GB },
  ],
  virtualDisks: [
    {
      kind: "dockerData",
      owner: "docker-desktop",
      path: "C:\\Users\\user\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
      size: 24.93 * GB,
      sparse: false,
    },
    {
      kind: "wslDistro",
      owner: DISTRO,
      path: "C:\\Users\\user\\AppData\\Local\\Packages\\CanonicalGroupLimited.Ubuntu24.04LTS_79rhkp1fndgsc\\LocalState\\ext4.vhdx",
      size: 24.33 * GB,
      sparse: true,
    },
  ],
  hiberfil: 12.55 * GB,
  systemDrive: "C:",
  recycleBin: { size: 6.17 * GB, items: 214 },
  wslDistros: [DISTRO],
  dockerCli: true,
};

function target(
  defId: string,
  size: number | null,
  paths: string[],
  extra: Partial<Target_Serialize> = {},
): Target_Serialize {
  const wsl = defId.startsWith("wsl-");
  return {
    id: wsl ? `${defId}@${DISTRO}` : defId,
    defId,
    category: ["win-recycle-bin", "win-temp", "win-crash-dumps", "win-squirrel-temp", "win-lmstudio-installer", "win-metaquotes-webinstall"].includes(defId)
      ? "windowsJunk"
      : "devCache",
    platform: wsl ? "wsl" : "windows",
    distro: wsl ? DISTRO : null,
    paths,
    command: null,
    size,
    blockedBy: null,
    risk: "safe",
    ...extra,
  };
}

const L = "C:\\Users\\user\\AppData\\Local";
const R = "C:\\Users\\user\\AppData\\Roaming";
const targets: Target_Serialize[] = [
  target("wsl-npm", 5.4 * GB, ["~/.npm/_cacache", "~/.npm/_npx"]),
  target("win-nuget-packages", 4.27 * GB, ["C:\\Users\\user\\.nuget\\packages"]),
  target("win-chrome-ai-model", 3.98 * GB, [`${L}\\Google\\Chrome\\User Data\\OptGuideOnDeviceModel`], { blockedBy: "chrome.exe" }),
  target("wsl-nuget", 2.5 * GB, ["~/.nuget/packages"]),
  target("wsl-playwright", 1.3 * GB, ["~/.cache/ms-playwright"]),
  target("win-nuget-http", 1.05 * GB, [`${L}\\NuGet\\v3-cache`]),
  target("win-vscode", 973 * MB, [`${R}\\Code\\CachedExtensionVSIXs`, `${R}\\Code\\Cache`, `${R}\\Code\\CachedData`]),
  target("win-npm", 662 * MB, [`${L}\\npm-cache\\_cacache`]),
  target("wsl-vscode-server-vsix", 611 * MB, ["~/.vscode-server/data/CachedExtensionVSIXs"]),
  target("wsl-pnpm-cache", 477 * MB, ["~/.cache/pnpm"]),
  target("win-electron", 436 * MB, [`${L}\\electron\\Cache`]),
  target("wsl-electron", 306 * MB, ["~/.cache/electron"]),
  target("wsl-uv", 92 * MB, ["~/.cache/uv"]),
  target("wsl-composer", 84 * MB, ["~/.cache/composer"]),
  target("wsl-node-gyp", 67 * MB, ["~/.cache/node-gyp"]),
  target("wsl-typescript", 64 * MB, ["~/.cache/typescript"]),
  target("wsl-pip", 38 * MB, ["~/.cache/pip"]),
  target("wsl-pnpm-store", null, ["~/.local/share/pnpm/store"], { command: "pnpm store prune" }),
  target("win-recycle-bin", 6.17 * GB, [], { risk: "permanent" }),
  target("win-lmstudio-installer", 0.98 * GB, [`${L}\\lm-studio-updater\\installer.exe`, `${L}\\lm-studio-updater\\pending`]),
  target("win-crash-dumps", 0.69 * GB, [`${L}\\CrashDumps`]),
  target("win-squirrel-temp", 0.52 * GB, [`${L}\\SquirrelTemp`]),
  target("win-metaquotes-webinstall", 0.48 * GB, [`${R}\\MetaQuotes\\WebInstall`]),
  target("win-temp", 0, [`${L}\\Temp`]),
];

const ws = "/home/neon/workspace/dev";
function project(name: string, daysAgo: number, artifacts: [string, number][], kind = "Node"): ProjectScan_Serialize["projects"][number] {
  const arts = artifacts.map(([n, size]) => ({ name: n, path: `${ws}/${name}/${n}`, size }));
  return {
    platform: "wsl",
    distro: DISTRO,
    name,
    path: `${ws}/${name}`,
    kind,
    lastModified: now - daysAgo * DAY,
    artifacts: arts,
    size: arts.reduce((s, a) => s + a.size, 0),
    active: daysAgo < 14,
  };
}
const projects: ProjectScan_Serialize = {
  projects: [
    project("easy-german", 41, [["node_modules", 1.0 * GB], [".next", 1.0 * GB]]),
    project("zealeducation", 148, [["node_modules", 1.1 * GB], [".angular", 40 * MB]]),
    project("dj-discord-bot", 0, [["node_modules", 904 * MB], [".next", 595 * MB]]),
    project("aifriend", 148, [["node_modules", 775 * MB], [".next", 267 * MB]]),
    project("quizlover", 185, [["node_modules", 490 * MB]]),
    project("GoldenRobber", 146, [["node_modules", 269 * MB], ["vendor", 85 * MB]], "Composer"),
    project("almighty-discord-bot", 185, [["node_modules", 103 * MB]]),
    project("scav-bot", 57, [["node_modules", 57 * MB]]),
    project("instruct-vsp-ip2407sg", 158, [["node_modules", 44 * MB]]),
  ],
  errors: [],
};

// Seeded with the two manual clean-ups this app was modelled on.
const history: CleanReport_Serialize[] = [
  {
    dryRun: false,
    startedAt: now - 2 * 3600_000,
    finishedAt: now - 2 * 3600_000 + 95_000,
    freed: 14.2 * GB,
    results: [
      { key: "win-recycle-bin", status: "done", freed: 6.17 * GB, failedPaths: [], failedCount: 0, message: null },
      { key: "win-nuget-packages", status: "done", freed: 4.27 * GB, failedPaths: [], failedCount: 0, message: null },
      { key: "win-nuget-http", status: "done", freed: 1.05 * GB, failedPaths: [], failedCount: 0, message: null },
      { key: "win-lmstudio-installer", status: "done", freed: 0.98 * GB, failedPaths: [], failedCount: 0, message: null },
      { key: "win-crash-dumps", status: "done", freed: 0.69 * GB, failedPaths: [], failedCount: 0, message: null },
      { key: "win-chrome-ai-model", status: "skipped", freed: 0, failedPaths: [], failedCount: 0, message: "chrome.exe is running" },
    ],
  },
  {
    dryRun: false,
    startedAt: now - 26 * 3600_000,
    finishedAt: now - 26 * 3600_000 + 40_000,
    freed: 14.7 * GB,
    results: [{ key: `admin:sparse:${DISTRO}`, status: "done", freed: 14.7 * GB, failedPaths: [], failedCount: 0, message: null }],
  },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sizeOf(item: CleanItem_Deserialize): number {
  if (item.kind === "target") return targets.find((t) => t.id === item.id)?.size ?? 0;
  return projects.projects.flatMap((p) => p.artifacts).find((a) => a.path === item.path)?.size ?? 0;
}

async function clean(items: CleanItem_Deserialize[], dryRun: boolean, channel: Channel<CleanEvent_Deserialize>) {
  const send = (e: CleanEvent_Deserialize) => channel.onmessage(e);
  const startedAt = Date.now();
  send({ type: "started", total: items.length });
  const results: ItemResult_Serialize[] = [];
  for (const item of items) {
    const key = item.kind === "target" ? item.id : `artifact:${item.distro ?? ""}:${item.path}`;
    send({ type: "itemStarted", key });
    if (!dryRun) await wait(250 + Math.random() * 450);
    const locked = !dryRun && item.kind === "target" && item.id === "win-vscode";
    const r: ItemResult_Serialize = {
      key,
      status: locked ? "partial" : "done",
      freed: sizeOf(item) * (locked ? 0.92 : 1),
      failedPaths: locked ? [`${R}\\Code\\Cache\\Cache_Data\\data_1`] : [],
      failedCount: locked ? 3 : 0,
      message: null,
    };
    results.push(r);
    send({ type: "itemFinished", result: r });
  }
  const freed = results.reduce((s, r) => s + r.freed, 0);
  send({ type: "finished", freed });
  const report = { dryRun, results, freed, startedAt, finishedAt: Date.now() };
  if (!dryRun) history.unshift(report);
  return report;
}

export function installMockIpc() {
  mockWindows("main");
  mockIPC(async (cmd, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "get_app_info":
        return { vibrancy: false, defaultProjectRoots: [`\\\\wsl.localhost\\${DISTRO}\\home`, "C:\\Users\\user\\source\\repos"] } satisfies AppInfo;
      case "get_overview":
        await wait(300);
        return overview;
      case "scan_targets":
        await wait(700);
        return { targets, errors: [] } satisfies TargetScan_Serialize;
      case "scan_projects":
        await wait(900);
        return projects;
      case "clean":
        return clean(args.items as CleanItem_Deserialize[], args.dryRun as boolean, args.onEvent as Channel<CleanEvent_Deserialize>);
      case "get_history":
        return history;
      case "set_window_theme":
        return null;
      case "run_admin_task": {
        await wait(4000);
        const task = args.task as { kind: string };
        const r: ItemResult_Serialize = {
          key: `admin:${task.kind}`,
          status: task.kind === "hibernateOff" ? "skipped" : "done",
          freed: task.kind === "dockerPrune" ? 2.4e9 : 0,
          failedPaths: [],
          failedCount: 0,
          message: task.kind === "hibernateOff" ? "cancelled" : null,
        };
        return r;
      }
      case "plugin:dialog|open":
        return "D:\\dev";
      case "open_folder":
        console.info("[mock ipc] open folder", args.distro ?? "", args.path);
        return null;
      case "plugin:event|listen":
        return 0;
      case "plugin:event|unlisten":
        return null;
      default:
        console.warn("[mock ipc] unhandled", cmd, payload);
        return null;
    }
  });
}

/**
 * Screenshot mode for the README (dev + mock only): `?page=caches&theme=dark&lang=en&dialog=clean`.
 * Lets a headless browser capture any screen without clicking through the UI.
 */
export async function applyScreenshotParams() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;
  const [{ useUi }, { useSettings }, { default: i18n }] = await Promise.all([
    import("@/stores/ui"),
    import("@/stores/settings"),
    import("@/i18n"),
  ]);
  const theme = q.get("theme");
  if (theme === "light" || theme === "dark") useSettings.getState().setTheme(theme);
  const lang = q.get("lang");
  if (lang === "vi" || lang === "en") await i18n.changeLanguage(lang);
  const page = q.get("page");
  if (page) useUi.getState().setPage(page as Parameters<ReturnType<typeof useUi.getState>["setPage"]>[0]);
  if (q.get("dialog") === "clean") {
    const pick = targets.filter((t) => t.category === "devCache" && !t.blockedBy && t.size).slice(0, 7);
    useUi.getState().openClean(
      pick.map((t) => ({
        item: { kind: "target" as const, id: t.id },
        label: i18n.t(`targets.${t.defId}`),
        where: t.platform === "wsl" ? "WSL" : "Windows",
        size: t.size,
      })),
      [{ label: i18n.t("targets.win-chrome-ai-model"), reason: i18n.t("caches.blocked", { process: "chrome.exe" }), size: 3.98 * GB }],
    );
  }
}
