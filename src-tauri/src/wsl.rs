//! WSL integration. Everything inside a distro runs through `wsl.exe -d <distro> --exec sh -c`
//! with small POSIX scripts, because walking `\\wsl.localhost\…` from Windows is very slow.
//! Paths are always passed as separate arguments (`"$@"`), never interpolated into the script.

use std::collections::{BTreeMap, HashMap};
use std::time::Duration;

use crate::proc::{self, ProcError};

/// A registered WSL distro (from `HKCU\…\Lxss`).
#[derive(Debug, Clone)]
pub struct Distro {
    pub name: String,
    /// Full path of the distro's `.vhdx` (WSL 2 only).
    pub vhdx: Option<std::path::PathBuf>,
}

#[derive(Debug, thiserror::Error)]
pub enum WslError {
    #[error(transparent)]
    Proc(#[from] ProcError),
    #[error("wsl.exe exited with {code:?}: {stderr}")]
    Failed { code: Option<i32>, stderr: String },
}

const SCAN_TIMEOUT: Duration = Duration::from_secs(300);
const CLEAN_TIMEOUT: Duration = Duration::from_secs(1800);

/// Distros registered for the current user, excluding Docker Desktop's internal ones.
pub fn distros() -> Vec<Distro> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let Ok(lxss) = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Lxss")
    else {
        return Vec::new();
    };
    let mut out: Vec<Distro> = lxss
        .enum_keys()
        .filter_map(Result::ok)
        .filter_map(|guid| lxss.open_subkey(&guid).ok())
        .filter_map(|key| {
            let name: String = key.get_value("DistributionName").ok()?;
            if name.starts_with("docker-desktop") {
                return None;
            }
            let base: Option<String> = key.get_value("BasePath").ok();
            let file: String = key
                .get_value("VhdFileName")
                .unwrap_or_else(|_| "ext4.vhdx".into());
            let vhdx = base
                .map(|b| std::path::PathBuf::from(b.trim_start_matches(r"\\?\")).join(file))
                .filter(|p| p.is_file());
            Some(Distro { name, vhdx })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Run `script` inside `distro` with `args` as `$1…$n`; returns stdout as UTF-8.
fn run_script(
    distro: &str,
    script: &str,
    args: &[String],
    timeout: Duration,
) -> Result<String, WslError> {
    let mut cmd = proc::command("wsl.exe");
    cmd.args(["-d", distro, "--exec", "sh", "-c", script, "sh"])
        .args(args);
    let out = proc::run(cmd, timeout)?;
    if !out.success {
        return Err(WslError::Failed {
            code: out.code,
            stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

const SIZE_SCRIPT: &str = r#"cd "$HOME" || exit 1
for p in "$@"; do
  s=0
  if [ -e "$p" ]; then s=$(du -sb -- "$p" 2>/dev/null | cut -f1); fi
  printf '%s\t%s\n' "${s:-0}" "$p"
done"#;

/// Size in bytes of each path (relative to `$HOME`, or absolute). Missing paths are 0.
pub fn sizes(distro: &str, paths: &[String]) -> Result<HashMap<String, u64>, WslError> {
    if paths.is_empty() {
        return Ok(HashMap::new());
    }
    let out = run_script(distro, SIZE_SCRIPT, paths, SCAN_TIMEOUT)?;
    Ok(out
        .lines()
        .filter_map(|l| l.split_once('\t'))
        .map(|(s, p)| (p.to_string(), s.trim().parse().unwrap_or(0)))
        .collect())
}

const DELETE_CONTENTS_SCRIPT: &str = r#"cd "$HOME" || exit 1
for p in "$@"; do
  case "$p" in ''|/*|*..*) continue ;; esac
  if [ -d "$p" ] && [ ! -L "$p" ]; then
    find "$p" -mindepth 1 -delete 2>/dev/null
  elif [ -e "$p" ] || [ -L "$p" ]; then
    rm -f -- "$p" 2>/dev/null
  fi
done
exit 0"#;

/// Empty registry paths (relative to `$HOME`, directories kept). Returns bytes freed.
pub fn delete_contents(distro: &str, paths: &[String]) -> Result<u64, WslError> {
    let before: u64 = sizes(distro, paths)?.values().sum();
    run_script(distro, DELETE_CONTENTS_SCRIPT, paths, CLEAN_TIMEOUT)?;
    let after: u64 = sizes(distro, paths)?.values().sum();
    Ok(before.saturating_sub(after))
}

const DELETE_TREE_SCRIPT: &str = r#"for p in "$@"; do
  case "$p" in /*) ;; *) continue ;; esac
  case "$p" in *..*) continue ;; esac
  rm -rf -- "$p" 2>/dev/null
  if [ -e "$p" ]; then printf 'FAIL\t%s\n' "$p"; fi
done
exit 0"#;

/// Remove whole artifact directories (absolute paths, already validated by the caller).
/// Returns (bytes freed, paths that could not be fully removed).
pub fn delete_trees(distro: &str, paths: &[String]) -> Result<(u64, Vec<String>), WslError> {
    let before = sizes(distro, paths)?;
    let out = run_script(distro, DELETE_TREE_SCRIPT, paths, CLEAN_TIMEOUT)?;
    let failed: Vec<String> = out
        .lines()
        .filter_map(|l| l.strip_prefix("FAIL\t"))
        .map(str::to_string)
        .collect();
    let after = if failed.is_empty() {
        HashMap::new()
    } else {
        sizes(distro, &failed)?
    };
    let freed = before
        .iter()
        .map(|(p, b)| b.saturating_sub(*after.get(p).unwrap_or(&0)))
        .sum();
    Ok((freed, failed))
}

/// Run a tool's own clean command (e.g. `pnpm store prune`) in a login+interactive bash so
/// version managers (nvm, corepack, fnm) are on PATH. Returns combined output on success.
pub fn run_command(distro: &str, command: &str) -> Result<String, WslError> {
    run_script(
        distro,
        r#"exec bash -lic "$1" 2>&1"#,
        &[command.to_string()],
        CLEAN_TIMEOUT,
    )
}

// ── Project scanning ─────────────────────────────────────────────────────────

/// Marker files that identify a project, and the kind reported for them.
const MARKERS: &[(&str, &str)] = &[
    ("package.json", "Node"),
    ("Cargo.toml", "Cargo"),
    ("composer.json", "Composer"),
    ("pyproject.toml", "Python"),
    ("requirements.txt", "Python"),
    ("setup.py", "Python"),
];

const FIND_PROJECTS_SCRIPT: &str = r#"for root in "$@"; do
  [ -d "$root" ] || continue
  find "$root" -mindepth 1 \( -name node_modules -o -name '.*' -o -name target -o -name vendor -o -name bin -o -name obj -o -name __pycache__ \) -prune \
    -o -type f \( -name package.json -o -name Cargo.toml -o -name composer.json -o -name pyproject.toml -o -name requirements.txt -o -name setup.py -o -name '*.csproj' -o -name '*.fsproj' \) \
    -printf '%h\t%f\n' 2>/dev/null
done
exit 0"#;

/// For each (dir, "name1:name2") pair: newest file mtime outside artifact dirs, and the size of
/// each artifact dir that exists.
const PROJECT_DETAILS_SCRIPT: &str = r#"while [ $# -ge 2 ]; do
  dir=$1; names=$2; shift 2
  m=$(find "$dir" \( -name node_modules -o -name .git -o -name .next -o -name .nuxt -o -name .svelte-kit -o -name .parcel-cache -o -name .turbo -o -name .angular -o -name target -o -name bin -o -name obj -o -name vendor -o -name .venv -o -name __pycache__ -o -name dist -o -name build \) -prune -o -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
  printf 'P\t%s\t%s\n' "$dir" "${m:-0}"
  old_ifs=$IFS; IFS=:
  for n in $names; do
    if [ -d "$dir/$n" ] && [ ! -L "$dir/$n" ]; then
      printf 'A\t%s\t%s\t%s\n' "$dir" "$n" "$(du -sb -- "$dir/$n" 2>/dev/null | cut -f1)"
    fi
  done
  IFS=$old_ifs
done
exit 0"#;

#[derive(Debug, Clone, PartialEq)]
pub struct WslProject {
    pub path: String,
    pub kind: &'static str,
    /// seconds since the Unix epoch
    pub last_modified: f64,
    /// (artifact name, absolute path, bytes)
    pub artifacts: Vec<(String, String, u64)>,
}

fn kind_of(file: &str) -> Option<&'static str> {
    if file.ends_with(".csproj") || file.ends_with(".fsproj") {
        return Some(".NET");
    }
    MARKERS.iter().find(|(m, _)| *m == file).map(|(_, k)| *k)
}

/// Group marker hits by directory and drop projects nested inside another project
/// (same rule as kondo: once a project is found, its subdirectories are not searched).
fn group_projects(find_output: &str) -> Vec<(String, &'static str, Vec<&'static str>)> {
    let mut by_dir: BTreeMap<String, Vec<&'static str>> = BTreeMap::new();
    for (dir, file) in find_output.lines().filter_map(|l| l.split_once('\t')) {
        if let Some(kind) = kind_of(file) {
            let kinds = by_dir.entry(dir.to_string()).or_default();
            if !kinds.contains(&kind) {
                kinds.push(kind);
            }
        }
    }
    let mut accepted: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for (dir, kinds) in by_dir {
        if accepted.iter().any(|a| dir.starts_with(&format!("{a}/"))) {
            continue;
        }
        accepted.push(dir.clone());
        let mut names: Vec<&'static str> = Vec::new();
        for k in &kinds {
            for n in crate::projects::artifact_names(k) {
                if !names.contains(n) {
                    names.push(n);
                }
            }
        }
        out.push((dir, kinds[0], names));
    }
    out
}

fn parse_details(output: &str, kinds: &HashMap<String, &'static str>) -> Vec<WslProject> {
    let mut projects: BTreeMap<String, WslProject> = BTreeMap::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        match parts.as_slice() {
            ["P", dir, mtime] => {
                projects.insert(
                    dir.to_string(),
                    WslProject {
                        path: dir.to_string(),
                        kind: kinds.get(*dir).copied().unwrap_or("Node"),
                        last_modified: mtime.parse().unwrap_or(0.0),
                        artifacts: Vec::new(),
                    },
                );
            }
            ["A", dir, name, size] => {
                if let Some(p) = projects.get_mut(*dir) {
                    p.artifacts.push((
                        name.to_string(),
                        format!("{dir}/{name}"),
                        size.parse().unwrap_or(0),
                    ));
                }
            }
            _ => {}
        }
    }
    projects
        .into_values()
        .filter(|p| !p.artifacts.is_empty())
        .collect()
}

/// Find projects under `roots` (Linux paths) inside `distro` and measure their artifacts.
pub fn scan_projects(distro: &str, roots: &[String]) -> Result<Vec<WslProject>, WslError> {
    let found = run_script(distro, FIND_PROJECTS_SCRIPT, roots, SCAN_TIMEOUT)?;
    let groups = group_projects(&found);
    if groups.is_empty() {
        return Ok(Vec::new());
    }
    let kinds: HashMap<String, &'static str> =
        groups.iter().map(|(d, k, _)| (d.clone(), *k)).collect();
    let args: Vec<String> = groups
        .into_iter()
        .flat_map(|(dir, _, names)| [dir, names.join(":")])
        .collect();
    let details = run_script(distro, PROJECT_DETAILS_SCRIPT, &args, SCAN_TIMEOUT)?;
    Ok(parse_details(&details, &kinds))
}

/// `\\wsl.localhost\Ubuntu\home\me` or `\\wsl$\Ubuntu\home\me` → (`Ubuntu`, `/home/me`).
pub fn parse_unc(path: &str) -> Option<(String, String)> {
    let p = path.replace('/', "\\");
    let lower = p.to_ascii_lowercase();
    let rest = ["\\\\wsl.localhost\\", "\\\\wsl$\\"]
        .iter()
        .find(|prefix| lower.starts_with(*prefix))
        .map(|prefix| &p[prefix.len()..])?;
    let (distro, linux) = match rest.split_once('\\') {
        Some((d, l)) => (d, l),
        None => (rest, ""),
    };
    if distro.is_empty() {
        return None;
    }
    let linux = format!("/{}", linux.trim_matches('\\').replace('\\', "/"));
    Some((distro.to_string(), linux))
}

/// (`Ubuntu`, `/home/me`) → `\\wsl.localhost\Ubuntu\home\me`, the way Explorer reaches a distro.
pub fn to_unc(distro: &str, linux: &str) -> Option<String> {
    let distro_ok =
        !distro.is_empty() && distro != "." && distro != ".." && !distro.contains(['\\', '/', ':']);
    if !distro_ok || !linux.starts_with('/') {
        return None;
    }
    let rest = linux.trim_matches('/').replace('/', "\\");
    Some(format!(r"\\wsl.localhost\{distro}\{rest}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_to_unc() {
        assert_eq!(
            to_unc("Ubuntu-24.04", "/home/neon/app"),
            Some(r"\\wsl.localhost\Ubuntu-24.04\home\neon\app".into())
        );
        assert_eq!(
            to_unc("Debian", "/"),
            Some(r"\\wsl.localhost\Debian\".into())
        );
        assert_eq!(to_unc("Ubuntu", "home/me"), None);
        assert_eq!(to_unc("..", "/etc"), None);
        assert_eq!(to_unc(r"a\b", "/etc"), None);
        assert_eq!(to_unc("", "/etc"), None);
    }

    #[test]
    fn unc_paths() {
        assert_eq!(
            parse_unc(r"\\wsl.localhost\Ubuntu-24.04\home\neon\workspace"),
            Some(("Ubuntu-24.04".into(), "/home/neon/workspace".into()))
        );
        assert_eq!(
            parse_unc(r"\\wsl$\Debian\"),
            Some(("Debian".into(), "/".into()))
        );
        assert_eq!(
            parse_unc("//wsl.localhost/Ubuntu/srv"),
            Some(("Ubuntu".into(), "/srv".into()))
        );
        assert_eq!(parse_unc(r"C:\Users\me"), None);
        assert_eq!(parse_unc(r"\\wsl.localhost\"), None);
    }

    #[test]
    fn grouping_skips_nested_projects_and_merges_markers() {
        let find = "/w/app\tpackage.json\n/w/app/packages/ui\tpackage.json\n/w/api/src/Api\tApi.csproj\n/w/php\tcomposer.json\n/w/php\tpackage.json\n/w/notes\tREADME.md\n";
        let groups = group_projects(find);
        let dirs: Vec<&str> = groups.iter().map(|(d, _, _)| d.as_str()).collect();
        assert_eq!(dirs, vec!["/w/api/src/Api", "/w/app", "/w/php"]);
        let api = &groups[0];
        assert_eq!(api.1, ".NET");
        assert!(api.2.contains(&"bin") && api.2.contains(&"obj"));
        let php = &groups[2];
        assert!(php.2.contains(&"vendor") && php.2.contains(&"node_modules"));
    }

    #[test]
    fn details_parsing_drops_projects_without_artifacts() {
        let mut kinds = HashMap::new();
        kinds.insert("/w/app".to_string(), "Node");
        kinds.insert("/w/empty".to_string(), "Node");
        let out = "P\t/w/app\t1762300000.5\nA\t/w/app\tnode_modules\t1048576\nA\t/w/app\t.next\t2048\nP\t/w/empty\t1700000000\n";
        let projects = parse_details(out, &kinds);
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, "/w/app");
        assert_eq!(projects[0].last_modified, 1762300000.5);
        assert_eq!(
            projects[0].artifacts[0],
            ("node_modules".into(), "/w/app/node_modules".into(), 1048576)
        );
    }
}
