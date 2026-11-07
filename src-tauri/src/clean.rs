//! The clean engine. Every item is resolved again from the registry or from the latest project
//! scan, so the frontend can never make us delete an arbitrary path. A dry run measures exactly
//! what a real run would remove and never touches the disk.

use std::collections::HashSet;
use std::path::Path;

use crate::fsutil::{self, DeleteOutcome};
use crate::model::{CleanEvent, CleanItem, CleanReport, ItemResult, ItemStatus, Platform};
use crate::projects;
use crate::recycle;
use crate::registry::{self, Action};
use crate::scan;
use crate::wsl;

/// (distro, path) of an artifact directory; distro is `None` on Windows.
pub type ArtifactKey = (Option<String>, String);

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

fn from_outcome(key: String, out: DeleteOutcome) -> ItemResult {
    ItemResult {
        key,
        status: if out.failed_count == 0 {
            ItemStatus::Done
        } else {
            ItemStatus::Partial
        },
        freed: out.freed as f64,
        failed_paths: out
            .failed
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
        failed_count: out.failed_count as f64,
        message: None,
    }
}

fn clean_target(id: &str, dry_run: bool, running: &HashSet<String>) -> ItemResult {
    let key = id.to_string();
    let (def_id, distro) = registry::split_target_id(id);
    let Some(def) = registry::find(def_id) else {
        return result(
            key,
            ItemStatus::Failed,
            0.0,
            Some(format!("unknown item {def_id}")),
        );
    };
    if let Some(process) = scan::blocked_by(def, running) {
        return result(
            key,
            ItemStatus::Skipped,
            0.0,
            Some(format!("{process} is running")),
        );
    }

    match (def.platform, def.action) {
        (Platform::Windows, Action::RecycleBin) => {
            if dry_run {
                return result(key, ItemStatus::Done, recycle::query().size, None);
            }
            match recycle::empty() {
                Ok(freed) => result(key, ItemStatus::Done, freed, None),
                Err(e) => result(key, ItemStatus::Failed, 0.0, Some(e)),
            }
        }
        (Platform::Windows, _) => {
            let paths: Vec<_> = def
                .paths
                .iter()
                .filter_map(|t| registry::resolve_windows(t))
                .collect();
            if dry_run {
                let size = paths
                    .iter()
                    .map(|p| fsutil::size_of(p, def.min_age()))
                    .sum::<u64>();
                return result(key, ItemStatus::Done, size as f64, None);
            }
            let mut out = DeleteOutcome::default();
            for p in &paths {
                out.merge(fsutil::delete_contents(p, def.min_age()));
            }
            from_outcome(key, out)
        }
        (Platform::Wsl, action) => {
            let Some(distro) = distro else {
                return result(key, ItemStatus::Failed, 0.0, Some("missing distro".into()));
            };
            let paths: Vec<String> = def.paths.iter().map(|p| p.to_string()).collect();
            let outcome = match (action, dry_run) {
                (Action::WslCommand(_), true) => Ok(0.0),
                (Action::WslCommand(command), false) => {
                    wsl::sizes(distro, &paths).and_then(|before| {
                        wsl::run_command(distro, command)?;
                        let after = wsl::sizes(distro, &paths)?;
                        let total =
                            |m: &std::collections::HashMap<String, u64>| m.values().sum::<u64>();
                        Ok(total(&before).saturating_sub(total(&after)) as f64)
                    })
                }
                (_, true) => wsl::sizes(distro, &paths).map(|m| m.values().sum::<u64>() as f64),
                (_, false) => wsl::delete_contents(distro, &paths).map(|b| b as f64),
            };
            match outcome {
                Ok(freed) => result(key, ItemStatus::Done, freed, None),
                Err(e) => result(key, ItemStatus::Failed, 0.0, Some(e.to_string())),
            }
        }
    }
}

fn clean_artifact(
    item: &CleanItem,
    platform: Platform,
    distro: &Option<String>,
    path: &str,
    dry_run: bool,
    allowed: &HashSet<ArtifactKey>,
) -> ItemResult {
    let key = item.key();
    let name = path.rsplit(['/', '\\']).next().unwrap_or_default();
    if !allowed.contains(&(distro.clone(), path.to_string())) || !projects::is_artifact_name(name) {
        return result(
            key,
            ItemStatus::Failed,
            0.0,
            Some("not part of the latest project scan".into()),
        );
    }
    match (platform, distro) {
        (Platform::Windows, _) => {
            let p = Path::new(path);
            if dry_run {
                return result(key, ItemStatus::Done, fsutil::size_of(p, None) as f64, None);
            }
            from_outcome(key, fsutil::delete_tree(p))
        }
        (Platform::Wsl, Some(distro)) => {
            let paths = vec![path.to_string()];
            if dry_run {
                return match wsl::sizes(distro, &paths) {
                    Ok(m) => result(key, ItemStatus::Done, m.values().sum::<u64>() as f64, None),
                    Err(e) => result(key, ItemStatus::Failed, 0.0, Some(e.to_string())),
                };
            }
            match wsl::delete_trees(distro, &paths) {
                Ok((freed, failed)) => ItemResult {
                    key,
                    status: if failed.is_empty() {
                        ItemStatus::Done
                    } else {
                        ItemStatus::Partial
                    },
                    freed: freed as f64,
                    failed_count: failed.len() as f64,
                    failed_paths: failed,
                    message: None,
                },
                Err(e) => result(key, ItemStatus::Failed, 0.0, Some(e.to_string())),
            }
        }
        (Platform::Wsl, None) => {
            result(key, ItemStatus::Failed, 0.0, Some("missing distro".into()))
        }
    }
}

/// Clean (or measure, when `dry_run`) every item in order, reporting progress through `emit`.
pub fn run(
    items: &[CleanItem],
    dry_run: bool,
    allowed: &HashSet<ArtifactKey>,
    emit: impl Fn(CleanEvent),
) -> CleanReport {
    let started_at = fsutil::now_ms();
    let running = scan::running_processes();
    emit(CleanEvent::Started {
        total: items.len() as u32,
    });

    let mut results = Vec::with_capacity(items.len());
    for item in items {
        emit(CleanEvent::ItemStarted { key: item.key() });
        let r = match item {
            CleanItem::Target { id } => clean_target(id, dry_run, &running),
            CleanItem::Artifact {
                platform,
                distro,
                path,
            } => clean_artifact(item, *platform, distro, path, dry_run, allowed),
        };
        emit(CleanEvent::ItemFinished { result: r.clone() });
        results.push(r);
    }

    let freed = results.iter().map(|r| r.freed).sum();
    emit(CleanEvent::Finished { freed });
    CleanReport {
        dry_run,
        results,
        freed,
        started_at,
        finished_at: fsutil::now_ms(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn artifact(dir: &Path) -> (CleanItem, ArtifactKey) {
        let path = dir.to_string_lossy().into_owned();
        (
            CleanItem::Artifact {
                platform: Platform::Windows,
                distro: None,
                path: path.clone(),
            },
            (None, path),
        )
    }

    #[test]
    fn dry_run_measures_without_deleting() {
        let root = tempfile::tempdir().unwrap();
        let nm = root.path().join("node_modules");
        fs::create_dir_all(nm.join("pkg")).unwrap();
        fs::write(nm.join("pkg/index.js"), vec![0u8; 64]).unwrap();
        let (item, key) = artifact(&nm);
        let allowed = HashSet::from([key]);

        let report = run(std::slice::from_ref(&item), true, &allowed, |_| {});
        assert!(report.dry_run);
        assert_eq!(report.freed, 64.0);
        assert!(nm.join("pkg/index.js").exists(), "dry run must not delete");

        let report = run(&[item], false, &allowed, |_| {});
        assert_eq!(report.results[0].status, ItemStatus::Done);
        assert_eq!(report.freed, 64.0);
        assert!(!nm.exists());
    }

    #[test]
    fn rejects_paths_not_from_the_last_scan() {
        let root = tempfile::tempdir().unwrap();
        let src = root.path().join("node_modules");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("keep.txt"), b"x").unwrap();
        let (item, _) = artifact(&src);

        let report = run(&[item], false, &HashSet::new(), |_| {});
        assert_eq!(report.results[0].status, ItemStatus::Failed);
        assert!(src.join("keep.txt").exists());
    }

    #[test]
    fn rejects_non_artifact_names_even_if_listed() {
        let root = tempfile::tempdir().unwrap();
        let src = root.path().join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("main.rs"), b"fn main(){}").unwrap();
        let (item, key) = artifact(&src);

        let report = run(&[item], false, &HashSet::from([key]), |_| {});
        assert_eq!(report.results[0].status, ItemStatus::Failed);
        assert!(src.join("main.rs").exists());
    }

    #[test]
    fn unknown_target_fails_and_events_are_emitted() {
        let events = std::cell::RefCell::new(Vec::new());
        let report = run(
            &[CleanItem::Target { id: "nope".into() }],
            true,
            &HashSet::new(),
            |e| events.borrow_mut().push(format!("{e:?}")),
        );
        assert_eq!(report.results[0].status, ItemStatus::Failed);
        let events = events.into_inner();
        assert_eq!(events.len(), 4, "{events:?}");
        assert!(events[0].starts_with("Started"));
        assert!(events[3].starts_with("Finished"));
    }

    #[test]
    fn dry_run_of_registry_target_does_not_touch_disk() {
        // win-temp only counts files older than 7 days and must never delete in a dry run.
        let report = run(
            &[CleanItem::Target {
                id: "win-temp".into(),
            }],
            true,
            &HashSet::new(),
            |_| {},
        );
        assert_eq!(report.results[0].status, ItemStatus::Done);
        assert!(report.results[0].failed_paths.is_empty());
    }
}
