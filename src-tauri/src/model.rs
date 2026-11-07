//! Types shared with the frontend. Every type here is exported to TypeScript by tauri-specta
//! (`src/lib/bindings.ts`). Byte counts and timestamps are `f64`: specta-typescript forbids
//! 64-bit integers, and every realistic value stays far below 2^53.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Exported as TS `number` (not `number | null`): sizes and timestamps are always finite.
type Num = specta_typescript::Number;

/// Where a cleanable item lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Platform {
    Windows,
    Wsl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    /// Downloaded caches of developer tools; re-downloaded on demand.
    DevCache,
    /// Windows leftovers: recycle bin, crash dumps, stale installers, old temp files.
    WindowsJunk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Risk {
    /// Nothing is lost; the owning tool recreates it.
    Safe,
    /// Must be rebuilt or reinstalled (e.g. `npm install`) before the owner works again.
    Rebuildable,
    /// Permanently removes user-visible data (recycle bin).
    Permanent,
}

/// One cleanable item found by a scan (a registry entry resolved on this machine).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    /// Registry id, suffixed with `@<distro>` for WSL items (e.g. `wsl-npm@Ubuntu-24.04`).
    pub id: String,
    /// Registry id without the distro suffix; the frontend's i18n key.
    pub def_id: String,
    pub category: Category,
    pub platform: Platform,
    pub distro: Option<String>,
    /// Paths that will be emptied (Windows paths, or `~/…` inside the distro).
    pub paths: Vec<String>,
    /// Shell command run instead of deleting files, when the tool must clean itself.
    pub command: Option<String>,
    /// Bytes that would be freed; `None` when it can only be known after running `command`.
    #[specta(type = Option<Num>)]
    pub size: Option<f64>,
    /// Process that must be closed first (e.g. `chrome.exe`); `None` when nothing blocks.
    pub blocked_by: Option<String>,
    pub risk: Risk,
}

/// A build-artifact directory inside a project (e.g. `node_modules`).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    /// Directory name relative to the project root (`node_modules`, `bin`, `android/build`…).
    pub name: String,
    /// Absolute path (Windows path, or Linux path inside the distro).
    pub path: String,
    #[specta(type = Num)]
    pub size: f64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub platform: Platform,
    pub distro: Option<String>,
    pub name: String,
    pub path: String,
    /// Project type as detected by kondo (`Node`, `Cargo`, `.NET`…).
    pub kind: String,
    /// Most recent modification of a non-ignored file, in ms since the Unix epoch.
    #[specta(type = Num)]
    pub last_modified: f64,
    pub artifacts: Vec<Artifact>,
    #[specta(type = Num)]
    pub size: f64,
    /// Modified within the "never touch" window: shown but never cleaned.
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub mount: String,
    pub label: String,
    pub file_system: String,
    #[specta(type = Num)]
    pub total: f64,
    #[specta(type = Num)]
    pub available: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum VirtualDiskKind {
    WslDistro,
    DockerData,
}

/// A `.vhdx` that holds a WSL distro or Docker's data. These grow but never shrink on their own.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VirtualDisk {
    pub kind: VirtualDiskKind,
    /// Distro name, or `docker-desktop` for Docker's data disk.
    pub owner: String,
    pub path: String,
    #[specta(type = Num)]
    pub size: f64,
    /// Sparse disks give space back to Windows automatically.
    pub sparse: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBinInfo {
    #[specta(type = Num)]
    pub size: f64,
    #[specta(type = Num)]
    pub items: f64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub disks: Vec<DiskInfo>,
    pub virtual_disks: Vec<VirtualDisk>,
    /// Size of `hiberfil.sys` on the system drive; `None` when hibernation is off.
    #[specta(type = Option<Num>)]
    pub hiberfil: Option<f64>,
    /// Drive Windows is installed on (`C:`, `D:`…), where `hiberfil.sys` and the caches live.
    pub system_drive: String,
    pub recycle_bin: RecycleBinInfo,
    pub wsl_distros: Vec<String>,
    /// `docker` CLI found on PATH.
    pub docker_cli: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TargetScan {
    pub targets: Vec<Target>,
    /// Non-fatal problems (e.g. a WSL distro that could not be started).
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScan {
    pub projects: Vec<Project>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// Mica is active: the frontend should let the window material show through.
    pub vibrancy: bool,
    /// Existing project folders to suggest on first run.
    pub default_project_roots: Vec<String>,
}

/// Something the user selected for cleaning.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CleanItem {
    /// A [`Target`] by its `id`.
    Target { id: String },
    /// A project artifact directory returned by the most recent project scan.
    Artifact {
        platform: Platform,
        distro: Option<String>,
        path: String,
    },
}

impl CleanItem {
    /// Stable key used in progress events and reports.
    pub fn key(&self) -> String {
        match self {
            CleanItem::Target { id } => id.clone(),
            CleanItem::Artifact { distro, path, .. } => match distro {
                Some(d) => format!("artifact:{d}:{path}"),
                None => format!("artifact:{path}"),
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ItemStatus {
    Done,
    /// Some files could not be removed (in use, access denied); the rest were.
    Partial,
    /// Not attempted (e.g. the owning app is running).
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub key: String,
    pub status: ItemStatus,
    /// Bytes freed, or bytes that would be freed in a dry run.
    #[specta(type = Num)]
    pub freed: f64,
    /// Up to 20 paths that could not be removed.
    pub failed_paths: Vec<String>,
    #[specta(type = Num)]
    pub failed_count: f64,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CleanReport {
    pub dry_run: bool,
    pub results: Vec<ItemResult>,
    #[specta(type = Num)]
    pub freed: f64,
    /// ms since the Unix epoch
    #[specta(type = Num)]
    pub started_at: f64,
    #[specta(type = Num)]
    pub finished_at: f64,
}

/// Streamed to the frontend while cleaning.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CleanEvent {
    Started {
        total: u32,
    },
    ItemStarted {
        key: String,
    },
    ItemFinished {
        result: ItemResult,
    },
    Finished {
        #[specta(type = Num)]
        freed: f64,
    },
}
