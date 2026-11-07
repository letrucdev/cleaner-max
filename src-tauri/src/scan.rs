//! Read-only scans: disk overview and registry targets. Nothing here modifies the disk.

use std::collections::HashSet;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};

use rayon::prelude::*;
use sysinfo::{Disks, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::fsutil;
use crate::model::{Category, DiskInfo, Overview, Platform, Target, VirtualDisk, VirtualDiskKind};
use crate::recycle;
use crate::registry::{self, Action, DEFS, Def};
use crate::wsl;

const FILE_ATTRIBUTE_SPARSE_FILE: u32 = 0x200;

fn virtual_disk(kind: VirtualDiskKind, owner: &str, path: &Path) -> Option<VirtualDisk> {
    let meta = std::fs::metadata(path).ok()?;
    Some(VirtualDisk {
        kind,
        owner: owner.to_string(),
        path: path.to_string_lossy().into_owned(),
        size: meta.len() as f64,
        sparse: meta.file_attributes() & FILE_ATTRIBUTE_SPARSE_FILE != 0,
    })
}

/// `hiberfil.sys` can't be opened, but its directory entry carries the size.
fn hiberfil_size(drive: &str) -> Option<f64> {
    std::fs::read_dir(format!("{drive}\\"))
        .ok()?
        .filter_map(Result::ok)
        .find(|e| e.file_name().eq_ignore_ascii_case("hiberfil.sys"))
        .and_then(|e| e.metadata().ok())
        .map(|m| m.len() as f64)
}

pub fn overview() -> Overview {
    let disks = Disks::new_with_refreshed_list()
        .map(|disks| {
            (&disks)
                .into_iter()
                .map(|d| DiskInfo {
                    mount: d.mount_point().to_string_lossy().into_owned(),
                    label: d.name().to_string_lossy().into_owned(),
                    file_system: d.file_system().to_string_lossy().into_owned(),
                    total: d.total_space() as f64,
                    available: d.available_space() as f64,
                })
                .collect()
        })
        .unwrap_or_default();

    let distros = wsl::distros();
    let mut virtual_disks: Vec<VirtualDisk> = distros
        .iter()
        .filter_map(|d| virtual_disk(VirtualDiskKind::WslDistro, &d.name, d.vhdx.as_deref()?))
        .collect();
    if let Some(docker) =
        registry::resolve_windows(r"{LOCALAPPDATA}\Docker\wsl\disk\docker_data.vhdx")
    {
        virtual_disks.extend(virtual_disk(
            VirtualDiskKind::DockerData,
            "docker-desktop",
            &docker,
        ));
    }
    virtual_disks.sort_by(|a, b| b.size.total_cmp(&a.size));

    let system_drive = fsutil::system_drive();
    Overview {
        disks,
        virtual_disks,
        hiberfil: hiberfil_size(&system_drive),
        system_drive,
        recycle_bin: recycle::query(),
        wsl_distros: distros.into_iter().map(|d| d.name).collect(),
        docker_cli: which::which("docker").is_ok(),
    }
}

/// Lower-case names of running processes.
pub fn running_processes() -> HashSet<String> {
    let Ok(mut sys) = System::new() else {
        return HashSet::new();
    };
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes()
        .values()
        .map(|p| p.name().to_string_lossy().to_ascii_lowercase())
        .collect()
}

pub fn blocked_by(def: &Def, running: &HashSet<String>) -> Option<String> {
    def.blocked_by
        .filter(|p| running.contains(&p.to_ascii_lowercase()))
        .map(str::to_string)
}

fn windows_target(def: &'static Def, running: &HashSet<String>) -> Option<Target> {
    let (paths, size) = match def.action {
        Action::RecycleBin => (Vec::new(), recycle::query().size),
        _ => {
            let existing: Vec<PathBuf> = def
                .paths
                .iter()
                .filter_map(|t| registry::resolve_windows(t))
                .filter(|p| p.exists())
                .collect();
            if existing.is_empty() {
                return None;
            }
            let size = existing
                .iter()
                .map(|p| fsutil::size_of(p, def.min_age()) as f64)
                .sum();
            (
                existing
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect(),
                size,
            )
        }
    };
    Some(Target {
        id: def.id.to_string(),
        def_id: def.id.to_string(),
        category: def.category,
        platform: Platform::Windows,
        distro: None,
        paths,
        command: None,
        size: Some(size),
        blocked_by: blocked_by(def, running),
        risk: def.risk,
    })
}

fn wsl_targets(distro: &str) -> Result<Vec<Target>, wsl::WslError> {
    let defs: Vec<&Def> = DEFS
        .iter()
        .filter(|d| d.platform == Platform::Wsl)
        .collect();
    let all_paths: Vec<String> = defs
        .iter()
        .flat_map(|d| d.paths.iter().map(|p| p.to_string()))
        .collect();
    let sizes = wsl::sizes(distro, &all_paths)?;
    Ok(defs
        .into_iter()
        .filter_map(|def| {
            let size: u64 = def
                .paths
                .iter()
                .map(|p| sizes.get(*p).copied().unwrap_or(0))
                .sum();
            if size == 0 {
                return None;
            }
            let command = match def.action {
                Action::WslCommand(c) => Some(c.to_string()),
                _ => None,
            };
            Some(Target {
                id: format!("{}@{distro}", def.id),
                def_id: def.id.to_string(),
                category: def.category,
                platform: Platform::Wsl,
                distro: Some(distro.to_string()),
                paths: def.paths.iter().map(|p| format!("~/{p}")).collect(),
                // A command's effect is only known after it runs.
                size: if command.is_some() {
                    None
                } else {
                    Some(size as f64)
                },
                command,
                blocked_by: None,
                risk: def.risk,
            })
        })
        .collect())
}

/// Resolve every registry entry on this machine. Returns targets plus per-distro errors.
pub fn targets(category: Option<Category>) -> (Vec<Target>, Vec<String>) {
    let running = running_processes();
    let mut out: Vec<Target> = DEFS
        .par_iter()
        .filter(|d| d.platform == Platform::Windows)
        .filter_map(|d| windows_target(d, &running))
        .collect();

    let mut errors = Vec::new();
    if category.is_none_or(|c| c == Category::DevCache) {
        for distro in wsl::distros() {
            match wsl_targets(&distro.name) {
                Ok(t) => out.extend(t),
                Err(e) => errors.push(format!("{}: {e}", distro.name)),
            }
        }
    }
    if let Some(c) = category {
        out.retain(|t| t.category == c);
    }
    out.sort_by(|a, b| b.size.unwrap_or(0.0).total_cmp(&a.size.unwrap_or(0.0)));
    (out, errors)
}
