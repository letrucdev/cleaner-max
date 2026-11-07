//! Size and delete helpers for local (Windows) paths.
//!
//! Deleting never aborts on the first error: files that are in use or denied are skipped and
//! reported, and everything else is still removed. Symlinks and junctions are never followed
//! (pnpm's `node_modules` on Windows is full of junctions pointing into the shared store).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use walkdir::WalkDir;

/// Max failed paths kept in a report; the total count is tracked separately.
pub const MAX_FAILED_PATHS: usize = 20;

#[derive(Debug, Default, Clone)]
pub struct DeleteOutcome {
    pub freed: u64,
    pub failed: Vec<PathBuf>,
    pub failed_count: u64,
}

impl DeleteOutcome {
    fn fail(&mut self, path: &Path) {
        self.failed_count += 1;
        if self.failed.len() < MAX_FAILED_PATHS {
            self.failed.push(path.to_path_buf());
        }
    }

    pub fn merge(&mut self, other: DeleteOutcome) {
        self.freed += other.freed;
        self.failed_count += other.failed_count;
        for p in other.failed {
            if self.failed.len() < MAX_FAILED_PATHS {
                self.failed.push(p);
            }
        }
    }
}

/// True when the entry's last modification is older than `min_age` (always true without a limit).
fn old_enough(meta: &fs::Metadata, min_age: Option<Duration>) -> bool {
    let Some(min_age) = min_age else { return true };
    match meta.modified() {
        Ok(modified) => SystemTime::now()
            .duration_since(modified)
            .map(|age| age >= min_age)
            .unwrap_or(false),
        // Unknown age: keep the file.
        Err(_) => false,
    }
}

/// Total size of the regular files at or below `path` that are older than `min_age`.
/// Missing paths count as 0. Links are not followed.
pub fn size_of(path: &Path, min_age: Option<Duration>) -> u64 {
    WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .filter(|m| old_enough(m, min_age))
        .map(|m| m.len())
        .sum()
}

/// Remove one file or link, clearing the read-only attribute and retrying once if needed.
fn remove_entry(path: &Path, is_dir_link: bool) -> io::Result<()> {
    let remove = || {
        if is_dir_link {
            fs::remove_dir(path)
        } else {
            fs::remove_file(path)
        }
    };
    match remove() {
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
            if let Ok(meta) = fs::symlink_metadata(path) {
                let mut perms = meta.permissions();
                if perms.readonly() {
                    #[allow(clippy::permissions_set_readonly_false)]
                    perms.set_readonly(false);
                    fs::set_permissions(path, perms)?;
                    return remove();
                }
            }
            Err(e)
        }
        other => other,
    }
}

/// Delete everything inside `path` (or `path` itself when it is a file), keeping the directory.
/// With `min_age`, only files older than that are removed; directories left empty are removed.
pub fn delete_contents(path: &Path, min_age: Option<Duration>) -> DeleteOutcome {
    let mut out = DeleteOutcome::default();
    let Ok(meta) = fs::symlink_metadata(path) else {
        return out; // already gone
    };
    if !meta.is_dir() {
        if old_enough(&meta, min_age) {
            match remove_entry(path, false) {
                Ok(()) => out.freed += meta.len(),
                Err(_) => out.fail(path),
            }
        }
        return out;
    }

    for entry in WalkDir::new(path)
        .min_depth(1)
        .follow_links(false)
        .contents_first(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        let ft = entry.file_type();
        let p = entry.path();
        if ft.is_dir() {
            // Only succeeds when empty; non-empty dirs hold kept or locked files.
            let _ = fs::remove_dir(p);
            continue;
        }
        let Ok(m) = entry.metadata() else { continue };
        if !old_enough(&m, min_age) {
            continue;
        }
        // A link to a directory (symlink or junction) must be removed with remove_dir.
        let is_dir_link = ft.is_symlink() && fs::metadata(p).map(|t| t.is_dir()).unwrap_or(false);
        match remove_entry(p, is_dir_link) {
            Ok(()) => {
                if ft.is_file() {
                    out.freed += m.len();
                }
            }
            Err(_) => out.fail(p),
        }
    }
    out
}

/// Delete `path` entirely (contents and the directory itself).
pub fn delete_tree(path: &Path) -> DeleteOutcome {
    let mut out = delete_contents(path, None);
    if out.failed_count == 0 && path.exists() && fs::remove_dir(path).is_err() {
        out.fail(path);
    }
    out
}

/// ms since the Unix epoch.
pub fn epoch_ms(t: SystemTime) -> f64 {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

pub fn now_ms() -> f64 {
    epoch_ms(SystemTime::now())
}

/// The drive Windows is installed on, e.g. `C:` or `D:` (from `%SystemDrive%`, then `%windir%`).
pub fn system_drive() -> String {
    parse_drive(std::env::var("SystemDrive").ok().as_deref())
        .or_else(|| parse_drive(std::env::var("windir").ok().as_deref()))
        .unwrap_or_else(|| "C:".into())
}

/// `d:`, `D:\` or `D:\Windows` → `D:`; anything else → `None`.
fn parse_drive(value: Option<&str>) -> Option<String> {
    let mut chars = value?.trim().chars();
    match (chars.next(), chars.next()) {
        (Some(letter), Some(':')) if letter.is_ascii_alphabetic() => {
            Some(format!("{}:", letter.to_ascii_uppercase()))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn drive_letters() {
        assert_eq!(parse_drive(Some("C:")), Some("C:".into()));
        assert_eq!(parse_drive(Some("d:\\")), Some("D:".into()));
        assert_eq!(parse_drive(Some(r"E:\Windows")), Some("E:".into()));
        assert_eq!(parse_drive(Some("")), None);
        assert_eq!(parse_drive(Some(r"\\server\share")), None);
        assert_eq!(parse_drive(None), None);
        assert!(system_drive().ends_with(':'));
    }

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        File::create(path)
            .unwrap()
            .write_all(&vec![0u8; bytes])
            .unwrap();
    }

    fn set_age(path: &Path, days: u64) {
        let t = SystemTime::now() - Duration::from_secs(days * 86_400);
        File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(t)
            .unwrap();
    }

    #[test]
    fn size_counts_files_recursively() {
        let dir = tempfile::tempdir().unwrap();
        write(&dir.path().join("a.bin"), 100);
        write(&dir.path().join("sub/b.bin"), 50);
        assert_eq!(size_of(dir.path(), None), 150);
        assert_eq!(size_of(&dir.path().join("missing"), None), 0);
    }

    #[test]
    fn delete_contents_keeps_root_and_frees_bytes() {
        let dir = tempfile::tempdir().unwrap();
        write(&dir.path().join("a.bin"), 100);
        write(&dir.path().join("sub/deep/b.bin"), 50);
        let out = delete_contents(dir.path(), None);
        assert_eq!(out.freed, 150);
        assert_eq!(out.failed_count, 0);
        assert!(dir.path().exists());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn min_age_keeps_recent_files() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.tmp");
        let fresh = dir.path().join("fresh.tmp");
        write(&old, 10);
        write(&fresh, 20);
        set_age(&old, 30);
        let week = Some(Duration::from_secs(7 * 86_400));
        assert_eq!(size_of(dir.path(), week), 10);
        let out = delete_contents(dir.path(), week);
        assert_eq!(out.freed, 10);
        assert!(!old.exists());
        assert!(fresh.exists());
    }

    #[test]
    fn readonly_files_are_removed() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("ro.bin");
        write(&f, 8);
        let mut perms = fs::metadata(&f).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&f, perms).unwrap();
        let out = delete_contents(dir.path(), None);
        assert_eq!(out.freed, 8);
        assert!(!f.exists());
    }

    #[cfg(windows)]
    #[test]
    fn locked_file_is_reported_and_others_still_deleted() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let locked = dir.path().join("locked.bin");
        let other = dir.path().join("other.bin");
        write(&locked, 5);
        write(&other, 7);
        // share_mode(0): no other handle may read, write or delete while this one is open.
        let _guard = File::options()
            .read(true)
            .share_mode(0)
            .open(&locked)
            .unwrap();
        let out = delete_contents(dir.path(), None);
        assert_eq!(out.freed, 7);
        assert_eq!(out.failed_count, 1);
        assert_eq!(out.failed, vec![locked.clone()]);
        assert!(locked.exists());
        assert!(!other.exists());
    }

    #[test]
    fn delete_tree_removes_the_directory() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        write(&nm.join("pkg/index.js"), 12);
        let out = delete_tree(&nm);
        assert_eq!(out.freed, 12);
        assert!(!nm.exists());
    }
}
