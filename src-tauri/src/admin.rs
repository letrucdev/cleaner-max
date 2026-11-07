//! Tasks that need administrator rights (UAC) or that restart WSL/Docker.
//!
//! Elevated tasks are written as a small PowerShell script into `%TEMP%\cleaner-max`, started
//! through `runas` (ShellExecuteEx "runas", one UAC prompt) and log to a file we read back.
//! Every input is validated against what this machine actually has: a `.vhdx` path must be one
//! the overview found, a distro must be registered.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use specta::Type;

use crate::model::{ItemResult, ItemStatus};
use crate::proc;
use crate::scan;
use crate::wsl;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AdminTask {
    /// Shut WSL down and compact a `.vhdx` with diskpart.
    CompactVhdx { path: String },
    /// `wsl --manage <distro> --set-sparse true`: the disk then returns freed space by itself.
    SetSparse { distro: String },
    /// `docker image prune -a` + `docker builder prune -a` (volumes are never touched).
    DockerPrune,
    /// `powercfg /h off`: removes hiberfil.sys (also disables Fast Startup).
    HibernateOff,
    /// `DISM /Online /Cleanup-Image /StartComponentCleanup`.
    DismCleanup,
}

impl AdminTask {
    pub fn key(&self) -> String {
        match self {
            AdminTask::CompactVhdx { path } => format!("admin:compact:{path}"),
            AdminTask::SetSparse { distro } => format!("admin:sparse:{distro}"),
            AdminTask::DockerPrune => "admin:docker-prune".into(),
            AdminTask::HibernateOff => "admin:hibernate-off".into(),
            AdminTask::DismCleanup => "admin:dism".into(),
        }
    }
}

/// ERROR_CANCELLED: the user answered "No" on the UAC prompt.
const ERROR_CANCELLED: i32 = 1223;
const DOCKER_TIMEOUT: Duration = Duration::from_secs(1800);

fn result(key: String, status: ItemStatus, freed: f64, message: Option<String>) -> ItemResult {
    ItemResult {
        key,
        status,
        freed,
        failed_paths: Vec::new(),
        failed_count: 0.0,
        message,
    }
}

/// Last lines of a log, enough to explain a failure in the UI.
fn tail(log: &str, lines: usize) -> String {
    let all: Vec<&str> = log
        .lines()
        .map(str::trim_end)
        .filter(|l| !l.is_empty())
        .collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

/// `wsl.exe`'s own messages are UTF-16; once redirected into a UTF-8 log they carry NULs.
fn clean_log(raw: &[u8]) -> String {
    let text = String::from_utf8_lossy(raw);
    text.trim_start_matches('\u{feff}').replace('\0', "")
}

fn quote_ps(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// The diskpart script for compacting one virtual disk.
pub fn diskpart_script(vhdx: &str) -> String {
    format!(
        "select vdisk file=\"{vhdx}\"\r\nattach vdisk readonly\r\ncompact vdisk\r\ndetach vdisk\r\nexit\r\n"
    )
}

/// PowerShell body for an elevated task (written to a .ps1 file, `$Log` is a parameter).
pub fn elevated_body(task: &AdminTask, diskpart_file: Option<&Path>) -> String {
    let steps = match task {
        AdminTask::CompactVhdx { .. } => {
            let dp = diskpart_file
                .map(|p| quote_ps(&p.to_string_lossy()))
                .unwrap_or_default();
            format!("wsl.exe --shutdown\n  Start-Sleep -Seconds 4\n  diskpart.exe /s {dp}")
        }
        AdminTask::SetSparse { distro } => {
            format!(
                "wsl.exe --shutdown\n  Start-Sleep -Seconds 2\n  wsl.exe --manage {} --set-sparse true",
                quote_ps(distro)
            )
        }
        AdminTask::HibernateOff => "powercfg.exe /h off".into(),
        AdminTask::DismCleanup => {
            "Dism.exe /Online /Cleanup-Image /StartComponentCleanup /NoRestart".into()
        }
        AdminTask::DockerPrune => unreachable!("docker prune runs without elevation"),
    };
    format!(
        "param([string]$Log)\n$ErrorActionPreference = 'Continue'\n& {{\n  {steps}\n  \"EXIT=$LASTEXITCODE\"\n}} *>&1 | Out-File -FilePath $Log -Encoding utf8\n"
    )
}

fn work_dir() -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join("cleaner-max");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Run `body` elevated. Ok(None) when the user declined the UAC prompt.
fn run_elevated(
    name: &str,
    body: &str,
    extra: Option<(&str, String)>,
) -> Result<Option<String>, String> {
    let dir = work_dir().map_err(|e| e.to_string())?;
    let stamp = crate::fsutil::now_ms() as u64;
    if let Some((file, content)) = &extra {
        fs::write(dir.join(file), content).map_err(|e| e.to_string())?;
    }
    let script = dir.join(format!("{name}-{stamp}.ps1"));
    let log = dir.join(format!("{name}-{stamp}.log"));
    // BOM so Windows PowerShell 5.1 reads the script as UTF-8 (paths may contain non-ASCII).
    fs::write(&script, format!("\u{feff}{body}")).map_err(|e| e.to_string())?;

    let status = runas::Command::new("powershell.exe")
        .args(&[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            &script.to_string_lossy(),
            "-Log",
            &log.to_string_lossy(),
        ])
        .show(false)
        .gui(true)
        .status();

    let out = fs::read(&log).map(|b| clean_log(&b)).unwrap_or_default();
    let _ = fs::remove_file(&script);
    if let Some((file, _)) = extra {
        let _ = fs::remove_file(dir.join(file));
    }
    match status {
        Err(e) if e.raw_os_error() == Some(ERROR_CANCELLED) => Ok(None),
        Err(e) => Err(format!("cannot start an elevated task: {e}")),
        Ok(_) if out.contains("EXIT=0") => Ok(Some(out)),
        Ok(_) => Err(tail(&out, 8)),
    }
}

fn file_size(path: &str) -> f64 {
    fs::metadata(path).map(|m| m.len() as f64).unwrap_or(0.0)
}

fn system_drive_free() -> f64 {
    let drive = crate::fsutil::system_drive();
    scan::overview()
        .disks
        .into_iter()
        .find(|d| {
            d.mount
                .to_ascii_uppercase()
                .starts_with(&drive.to_ascii_uppercase())
        })
        .map(|d| d.available)
        .unwrap_or(0.0)
}

/// Parse docker's "Total reclaimed space: 1.234GB" (decimal units).
pub fn parse_docker_reclaimed(output: &str) -> f64 {
    output
        .lines()
        .filter_map(|l| l.trim().strip_prefix("Total reclaimed space:"))
        .filter_map(|v| {
            let v = v.trim();
            let split = v.find(|c: char| !(c.is_ascii_digit() || c == '.'))?;
            let (num, unit) = v.split_at(split);
            let n: f64 = num.parse().ok()?;
            let mult = match unit.trim().to_ascii_uppercase().as_str() {
                "B" => 1.0,
                "KB" => 1e3,
                "MB" => 1e6,
                "GB" => 1e9,
                "TB" => 1e12,
                _ => return None,
            };
            Some(n * mult)
        })
        .sum()
}

fn docker_prune(key: String) -> ItemResult {
    let Ok(docker) = which::which("docker") else {
        return result(
            key,
            ItemStatus::Skipped,
            0.0,
            Some("docker CLI not found".into()),
        );
    };
    let mut log = String::new();
    let mut freed = 0.0;
    for args in [
        ["image", "prune", "-a", "-f"],
        ["builder", "prune", "-a", "-f"],
    ] {
        let mut cmd = proc::command(&docker.to_string_lossy());
        cmd.args(args);
        match proc::run(cmd, DOCKER_TIMEOUT) {
            Ok(out) if out.success => {
                let text = String::from_utf8_lossy(&out.stdout).into_owned();
                freed += parse_docker_reclaimed(&text);
                log.push_str(&text);
            }
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                return result(key, ItemStatus::Failed, freed, Some(tail(&err, 6)));
            }
            Err(e) => return result(key, ItemStatus::Failed, freed, Some(e.to_string())),
        }
    }
    result(key, ItemStatus::Done, freed, Some(tail(&log, 6)))
}

/// Run one admin task (blocking). Returns a result in the same shape as clean results.
pub fn run(task: &AdminTask) -> ItemResult {
    let key = task.key();
    let overview = scan::overview();

    let outcome = match task {
        AdminTask::DockerPrune => return docker_prune(key),
        AdminTask::CompactVhdx { path } => {
            let Some(disk) = overview
                .virtual_disks
                .iter()
                .find(|d| d.path.eq_ignore_ascii_case(path))
            else {
                return result(
                    key,
                    ItemStatus::Failed,
                    0.0,
                    Some("unknown virtual disk".into()),
                );
            };
            if path.contains('"') {
                return result(key, ItemStatus::Failed, 0.0, Some("invalid path".into()));
            }
            let running = scan::running_processes();
            if running.contains("docker desktop.exe") {
                return result(
                    key,
                    ItemStatus::Skipped,
                    0.0,
                    Some("Docker Desktop is running".into()),
                );
            }
            let before = disk.size;
            let dp_name = format!("compact-{}.txt", crate::fsutil::now_ms() as u64);
            let dp_path = work_dir().map(|d| d.join(&dp_name)).ok();
            let body = elevated_body(task, dp_path.as_deref());
            run_elevated("compact", &body, Some((&dp_name, diskpart_script(path))))
                .map(|o| o.map(|log| ((before - file_size(path)).max(0.0), log)))
        }
        AdminTask::SetSparse { distro } => {
            if !wsl::distros().iter().any(|d| &d.name == distro) {
                return result(key, ItemStatus::Failed, 0.0, Some("unknown distro".into()));
            }
            run_elevated("sparse", &elevated_body(task, None), None)
                .map(|o| o.map(|log| (0.0, log)))
        }
        AdminTask::HibernateOff => {
            let before = overview.hiberfil.unwrap_or(0.0);
            run_elevated("hibernate", &elevated_body(task, None), None)
                .map(|o| o.map(|log| (before, log)))
        }
        AdminTask::DismCleanup => {
            let before = system_drive_free();
            run_elevated("dism", &elevated_body(task, None), None)
                .map(|o| o.map(|log| ((system_drive_free() - before).max(0.0), log)))
        }
    };

    match outcome {
        Ok(Some((freed, log))) => result(key, ItemStatus::Done, freed, Some(tail(&log, 6))),
        Ok(None) => result(key, ItemStatus::Skipped, 0.0, Some("cancelled".into())),
        Err(e) => result(key, ItemStatus::Failed, 0.0, Some(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diskpart_script_targets_the_given_disk_readonly() {
        let s = diskpart_script(r"C:\Users\me\AppData\Local\Docker\wsl\disk\docker_data.vhdx");
        assert!(s.starts_with("select vdisk file=\"C:\\Users\\me\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx\""));
        assert!(s.contains("attach vdisk readonly"));
        assert!(s.contains("compact vdisk"));
        assert!(s.contains("detach vdisk"));
    }

    #[test]
    fn elevated_scripts_log_exit_code_and_quote_inputs() {
        let s = elevated_body(
            &AdminTask::SetSparse {
                distro: "It's-Ubuntu".into(),
            },
            None,
        );
        assert!(s.contains("--manage 'It''s-Ubuntu' --set-sparse true"));
        assert!(s.contains("\"EXIT=$LASTEXITCODE\""));
        assert!(s.contains("Out-File -FilePath $Log"));
        let s = elevated_body(
            &AdminTask::CompactVhdx { path: "x".into() },
            Some(Path::new(r"C:\t\dp.txt")),
        );
        assert!(s.contains("wsl.exe --shutdown"));
        assert!(s.contains(r"diskpart.exe /s 'C:\t\dp.txt'"));
        assert!(elevated_body(&AdminTask::HibernateOff, None).contains("powercfg.exe /h off"));
    }

    #[test]
    fn docker_reclaimed_space_is_parsed() {
        let out = "Deleted Images:\nuntagged: x\n\nTotal reclaimed space: 1.5GB\n";
        assert_eq!(parse_docker_reclaimed(out), 1.5e9);
        assert_eq!(parse_docker_reclaimed("Total reclaimed space: 0B"), 0.0);
        assert_eq!(
            parse_docker_reclaimed("Total reclaimed space: 512kB"),
            512e3
        );
        assert_eq!(parse_docker_reclaimed("nothing"), 0.0);
    }

    #[test]
    fn wsl_utf16_noise_is_removed_from_logs() {
        let raw = "\u{feff}T\0h\0e\0 \0o\0p\0\nEXIT=0".as_bytes();
        assert_eq!(clean_log(raw), "The op\nEXIT=0");
    }

    #[test]
    fn unknown_inputs_are_rejected_without_elevating() {
        let r = run(&AdminTask::CompactVhdx {
            path: r"C:\Windows\System32\config\SAM".into(),
        });
        assert_eq!(r.status, ItemStatus::Failed);
        let r = run(&AdminTask::SetSparse {
            distro: "definitely-not-a-distro".into(),
        });
        assert_eq!(r.status, ItemStatus::Failed);
    }

    #[test]
    fn task_keys_are_stable() {
        assert_eq!(AdminTask::DockerPrune.key(), "admin:docker-prune");
        assert_eq!(
            AdminTask::SetSparse { distro: "U".into() }.key(),
            "admin:sparse:U"
        );
    }
}
