//! Declarative list of everything the app knows how to clean. Adding a cache is adding a `Def`;
//! the scanner and the clean engine only read this table.
//!
//! Windows paths use placeholders resolved with the `dirs` crate:
//! `{LOCALAPPDATA}`, `{APPDATA}` (Roaming), `{HOME}` (%USERPROFILE%), `{TEMP}`.
//! WSL paths are relative to the user's `$HOME` inside the distro.

use std::path::PathBuf;
use std::time::Duration;

use crate::model::{Category, Platform, Risk};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Empty the listed paths (directories are kept, their contents removed).
    Delete,
    /// Run a shell command inside the distro; the tool cleans its own data.
    /// `paths` are only measured before/after to report what was freed.
    WslCommand(&'static str),
    /// Empty the Windows recycle bin on every drive.
    RecycleBin,
}

#[derive(Debug, Clone, Copy)]
pub struct Def {
    pub id: &'static str,
    pub category: Category,
    pub platform: Platform,
    pub paths: &'static [&'static str],
    pub action: Action,
    /// Skip while this process is running (its files are in use or it would re-download them).
    pub blocked_by: Option<&'static str>,
    /// Only remove files older than this many days.
    pub min_age_days: Option<u64>,
    pub risk: Risk,
}

impl Def {
    pub fn min_age(&self) -> Option<Duration> {
        self.min_age_days.map(|d| Duration::from_secs(d * 86_400))
    }
}

const fn win(id: &'static str, category: Category, paths: &'static [&'static str]) -> Def {
    Def {
        id,
        category,
        platform: Platform::Windows,
        paths,
        action: Action::Delete,
        blocked_by: None,
        min_age_days: None,
        risk: Risk::Safe,
    }
}

const fn wsl(id: &'static str, paths: &'static [&'static str]) -> Def {
    Def {
        id,
        category: Category::DevCache,
        platform: Platform::Wsl,
        paths,
        action: Action::Delete,
        blocked_by: None,
        min_age_days: None,
        risk: Risk::Safe,
    }
}

use Category::{DevCache, WindowsJunk};

pub static DEFS: &[Def] = &[
    // ── Windows: developer caches ────────────────────────────────────────────
    win(
        "win-npm",
        DevCache,
        &[
            r"{LOCALAPPDATA}\npm-cache\_cacache",
            r"{LOCALAPPDATA}\npm-cache\_npx",
        ],
    ),
    win("win-nuget-packages", DevCache, &[r"{HOME}\.nuget\packages"]),
    win(
        "win-nuget-http",
        DevCache,
        &[
            r"{LOCALAPPDATA}\NuGet\v3-cache",
            r"{LOCALAPPDATA}\NuGet\plugins-cache",
        ],
    ),
    win("win-pip", DevCache, &[r"{LOCALAPPDATA}\pip\Cache"]),
    win("win-uv", DevCache, &[r"{LOCALAPPDATA}\uv\cache"]),
    win("win-yarn", DevCache, &[r"{LOCALAPPDATA}\Yarn\Cache"]),
    win("win-pnpm-cache", DevCache, &[r"{LOCALAPPDATA}\pnpm-cache"]),
    win(
        "win-playwright",
        DevCache,
        &[r"{LOCALAPPDATA}\ms-playwright"],
    ),
    win(
        "win-electron",
        DevCache,
        &[r"{LOCALAPPDATA}\electron\Cache"],
    ),
    win(
        "win-vscode",
        DevCache,
        &[
            r"{APPDATA}\Code\CachedExtensionVSIXs",
            r"{APPDATA}\Code\Cache",
            r"{APPDATA}\Code\CachedData",
        ],
    ),
    Def {
        blocked_by: Some("chrome.exe"),
        ..win(
            "win-chrome-ai-model",
            DevCache,
            &[r"{LOCALAPPDATA}\Google\Chrome\User Data\OptGuideOnDeviceModel"],
        )
    },
    // ── Windows: junk ────────────────────────────────────────────────────────
    Def {
        action: Action::RecycleBin,
        risk: Risk::Permanent,
        ..win("win-recycle-bin", WindowsJunk, &[])
    },
    Def {
        min_age_days: Some(7),
        ..win("win-temp", WindowsJunk, &[r"{TEMP}"])
    },
    win(
        "win-crash-dumps",
        WindowsJunk,
        &[r"{LOCALAPPDATA}\CrashDumps"],
    ),
    win(
        "win-squirrel-temp",
        WindowsJunk,
        &[r"{LOCALAPPDATA}\SquirrelTemp"],
    ),
    win(
        "win-lmstudio-installer",
        WindowsJunk,
        &[
            r"{LOCALAPPDATA}\lm-studio-updater\installer.exe",
            r"{LOCALAPPDATA}\lm-studio-updater\pending",
        ],
    ),
    win(
        "win-metaquotes-webinstall",
        WindowsJunk,
        &[r"{APPDATA}\MetaQuotes\WebInstall"],
    ),
    // ── WSL: developer caches (per distro) ───────────────────────────────────
    wsl("wsl-npm", &[".npm/_cacache", ".npm/_npx"]),
    wsl("wsl-pnpm-cache", &[".cache/pnpm"]),
    // Only prunes packages no project references: the store is hard-linked into live projects.
    Def {
        action: Action::WslCommand("pnpm store prune"),
        ..wsl("wsl-pnpm-store", &[".local/share/pnpm/store"])
    },
    wsl("wsl-yarn", &[".cache/yarn"]),
    wsl("wsl-nuget", &[".nuget/packages"]),
    wsl("wsl-playwright", &[".cache/ms-playwright"]),
    wsl(
        "wsl-vscode-server-vsix",
        &[".vscode-server/data/CachedExtensionVSIXs"],
    ),
    wsl("wsl-electron", &[".cache/electron"]),
    wsl("wsl-node-gyp", &[".cache/node-gyp"]),
    wsl("wsl-typescript", &[".cache/typescript"]),
    wsl("wsl-uv", &[".cache/uv"]),
    wsl("wsl-pip", &[".cache/pip"]),
    wsl("wsl-composer", &[".cache/composer"]),
    wsl("wsl-go-build", &[".cache/go-build"]),
];

pub fn find(def_id: &str) -> Option<&'static Def> {
    DEFS.iter().find(|d| d.id == def_id)
}

/// Split a target id into (registry id, distro): `wsl-npm@Ubuntu` → (`wsl-npm`, Some(`Ubuntu`)).
pub fn split_target_id(id: &str) -> (&str, Option<&str>) {
    match id.split_once('@') {
        Some((def, distro)) => (def, Some(distro)),
        None => (id, None),
    }
}

/// Resolve a Windows path template. `None` when a placeholder's base directory is unknown.
pub fn resolve_windows(template: &str) -> Option<PathBuf> {
    let (key, rest) = template.strip_prefix('{')?.split_once('}')?;
    let base = match key {
        "LOCALAPPDATA" => dirs::data_local_dir()?,
        "APPDATA" => dirs::data_dir()?,
        "HOME" => dirs::home_dir()?,
        "TEMP" => std::env::temp_dir(),
        _ => return None,
    };
    let rest = rest.trim_start_matches('\\');
    Some(if rest.is_empty() {
        base
    } else {
        base.join(rest)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn ids_are_unique_and_have_no_separator() {
        let mut seen = HashSet::new();
        for d in DEFS {
            assert!(seen.insert(d.id), "duplicate id {}", d.id);
            assert!(!d.id.contains('@'), "id {} must not contain '@'", d.id);
        }
    }

    #[test]
    fn windows_templates_resolve() {
        for d in DEFS.iter().filter(|d| d.platform == Platform::Windows) {
            for p in d.paths {
                assert!(resolve_windows(p).is_some(), "{} cannot resolve {p}", d.id);
            }
        }
    }

    #[test]
    fn wsl_paths_are_relative_and_safe() {
        for d in DEFS.iter().filter(|d| d.platform == Platform::Wsl) {
            assert_eq!(d.category, Category::DevCache);
            for p in d.paths {
                assert!(
                    !p.starts_with('/') && !p.contains("..") && !p.is_empty(),
                    "{} has unsafe path {p}",
                    d.id
                );
            }
        }
    }

    #[test]
    fn target_id_split() {
        assert_eq!(
            split_target_id("wsl-npm@Ubuntu-24.04"),
            ("wsl-npm", Some("Ubuntu-24.04"))
        );
        assert_eq!(split_target_id("win-npm"), ("win-npm", None));
    }
}
