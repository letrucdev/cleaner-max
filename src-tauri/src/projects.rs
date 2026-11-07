//! Find projects and their build artifacts. Local (Windows) roots use `kondo-lib`; roots inside
//! WSL (`\\wsl.localhost\<distro>\…`) are scanned in the distro by `wsl::scan_projects`.

use std::path::Path;
use std::time::{Duration, SystemTime};

use kondo_lib::{ProjectType, ScanOptions};
use rayon::prelude::*;

use crate::fsutil;
use crate::model::{Artifact, Platform, Project};
use crate::wsl;

/// Build-cache dirs of Node projects that kondo doesn't list. `dist`/`build` are deliberately
/// excluded: some projects commit them.
const NODE_EXTRA: &[&str] = &[".next", ".nuxt", ".svelte-kit", ".parcel-cache", ".turbo"];

/// Artifact directory names per project kind (kondo's lists, plus [`NODE_EXTRA`] for Node).
pub fn artifact_names(kind: &str) -> &'static [&'static str] {
    match kind {
        "Node" => &[
            "node_modules",
            ".angular",
            ".next",
            ".nuxt",
            ".svelte-kit",
            ".parcel-cache",
            ".turbo",
        ],
        "Cargo" => &["target", ".xwin-cache"],
        ".NET" => &["bin", "obj"],
        "Composer" => &["vendor"],
        "Python" => &[
            ".mypy_cache",
            ".nox",
            ".pytest_cache",
            ".ruff_cache",
            ".tox",
            ".venv",
            "__pycache__",
            "__pypackages__",
        ],
        _ => &[],
    }
}

/// Every name an artifact may have; the last path component of anything we delete must be one.
pub fn is_artifact_name(name: &str) -> bool {
    ["Node", "Cargo", ".NET", "Composer", "Python"]
        .iter()
        .any(|k| artifact_names(k).contains(&name))
}

fn kondo_options() -> ScanOptions {
    ScanOptions {
        follow_symlinks: false,
        same_file_system: true,
    }
}

fn name_of(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(path)
        .to_string()
}

fn is_active(last_modified_ms: f64, active_days: u32) -> bool {
    let window = Duration::from_secs(u64::from(active_days) * 86_400).as_millis() as f64;
    fsutil::now_ms() - last_modified_ms < window
}

fn scan_local(root: &Path, active_days: u32) -> Vec<Project> {
    let options = kondo_options();
    let found: Vec<kondo_lib::Project> = kondo_lib::scan(&root, &options)
        .filter_map(Result::ok)
        .collect();
    found
        .par_iter()
        .filter_map(|p| {
            let mut names: Vec<&str> = p.artifact_dirs().to_vec();
            if matches!(p.project_type, ProjectType::Node) {
                let extra: Vec<&str> = NODE_EXTRA
                    .iter()
                    .copied()
                    .filter(|n| !names.contains(n))
                    .collect();
                names.extend(extra);
            }
            let artifacts: Vec<Artifact> = names
                .into_iter()
                .filter_map(|name| {
                    let dir = p.path.join(name);
                    let meta = std::fs::symlink_metadata(&dir).ok()?;
                    if !meta.is_dir() {
                        return None;
                    }
                    let size = fsutil::size_of(&dir, None) as f64;
                    (size > 0.0).then(|| Artifact {
                        name: name.to_string(),
                        path: dir.to_string_lossy().into_owned(),
                        size,
                    })
                })
                .collect();
            if artifacts.is_empty() {
                return None;
            }
            let last_modified =
                fsutil::epoch_ms(p.last_modified(&options).unwrap_or(SystemTime::UNIX_EPOCH));
            let path = p.path.to_string_lossy().into_owned();
            Some(Project {
                platform: Platform::Windows,
                distro: None,
                name: name_of(&path),
                kind: p.type_name().to_string(),
                last_modified,
                size: artifacts.iter().map(|a| a.size).sum(),
                artifacts,
                active: is_active(last_modified, active_days),
                path,
            })
        })
        .collect()
}

fn scan_wsl(
    distro: &str,
    roots: &[String],
    active_days: u32,
) -> Result<Vec<Project>, wsl::WslError> {
    Ok(wsl::scan_projects(distro, roots)?
        .into_iter()
        .map(|p| {
            let last_modified = p.last_modified * 1000.0;
            let artifacts: Vec<Artifact> = p
                .artifacts
                .into_iter()
                .map(|(name, path, size)| Artifact {
                    name,
                    path,
                    size: size as f64,
                })
                .collect();
            Project {
                platform: Platform::Wsl,
                distro: Some(distro.to_string()),
                name: name_of(&p.path),
                kind: p.kind.to_string(),
                last_modified,
                size: artifacts.iter().map(|a| a.size).sum(),
                artifacts,
                active: is_active(last_modified, active_days),
                path: p.path,
            }
        })
        .collect())
}

/// Project folders worth scanning by default: `/home` in each WSL distro, plus common
/// Windows locations that exist on this machine.
pub fn default_roots() -> Vec<String> {
    let mut roots: Vec<String> = wsl::distros()
        .into_iter()
        .map(|d| format!(r"\\wsl.localhost\{}\home", d.name))
        .collect();
    if let Some(home) = dirs::home_dir() {
        for rel in [
            r"source\repos",
            "projects",
            "dev",
            "workspace",
            r"Documents\GitHub",
        ] {
            let p = home.join(rel);
            if p.is_dir() {
                roots.push(p.to_string_lossy().into_owned());
            }
        }
    }
    roots
}

/// Scan every root. Errors for one root (e.g. a stopped distro) don't hide the others' results.
pub fn scan(roots: &[String], active_days: u32) -> (Vec<Project>, Vec<String>) {
    let mut projects = Vec::new();
    let mut errors = Vec::new();

    let mut wsl_roots: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    let mut local_roots = Vec::new();
    for root in roots {
        match wsl::parse_unc(root) {
            Some((distro, linux)) => wsl_roots.entry(distro).or_default().push(linux),
            None => local_roots.push(root.clone()),
        }
    }

    for root in local_roots {
        let path = Path::new(&root);
        if path.is_dir() {
            projects.extend(scan_local(path, active_days));
        } else {
            errors.push(format!("{root}: not a folder"));
        }
    }
    for (distro, linux_roots) in wsl_roots {
        match scan_wsl(&distro, &linux_roots, active_days) {
            Ok(found) => projects.extend(found),
            Err(e) => errors.push(format!("{distro}: {e}")),
        }
    }
    projects.sort_by(|a, b| b.size.total_cmp(&a.size));
    (projects, errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// kondo skips hidden directories, and tempfile's default `.tmpXXXX` name is hidden.
    fn tempdir() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("dc-test-")
            .tempdir()
            .unwrap()
    }

    fn file(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1u8; bytes]).unwrap();
    }

    #[test]
    fn finds_node_and_dotnet_artifacts() {
        let root = tempdir();
        let web = root.path().join("web");
        file(&web.join("package.json"), 2);
        file(&web.join("node_modules/react/index.js"), 300);
        file(&web.join(".next/cache/x"), 200);
        file(&web.join("dist/app.js"), 50); // not an artifact
        let api = root.path().join("api");
        file(&api.join("Api.csproj"), 2);
        file(&api.join("bin/Debug/Api.dll"), 100);
        file(&api.join("obj/project.assets.json"), 10);
        let docs = root.path().join("docs");
        file(&docs.join("README.md"), 5);

        let (projects, errors) = scan(&[root.path().to_string_lossy().into_owned()], 14);
        assert!(errors.is_empty());
        assert_eq!(projects.len(), 2);

        let web_p = projects.iter().find(|p| p.name == "web").unwrap();
        assert_eq!(web_p.kind, "Node");
        let mut names: Vec<&str> = web_p.artifacts.iter().map(|a| a.name.as_str()).collect();
        names.sort();
        assert_eq!(names, vec![".next", "node_modules"]);
        assert_eq!(web_p.size, 500.0);
        assert!(web_p.active, "just created, so inside the 14-day window");

        let api_p = projects.iter().find(|p| p.name == "api").unwrap();
        assert_eq!(api_p.kind, ".NET");
        assert_eq!(api_p.size, 110.0);
    }

    #[test]
    fn projects_without_artifacts_are_omitted() {
        let root = tempdir();
        file(&root.path().join("clean/package.json"), 2);
        let (projects, _) = scan(&[root.path().to_string_lossy().into_owned()], 14);
        assert!(projects.is_empty());
    }

    #[test]
    fn active_window() {
        let day = 86_400_000.0;
        assert!(is_active(fsutil::now_ms() - 3.0 * day, 14));
        assert!(!is_active(fsutil::now_ms() - 30.0 * day, 14));
    }

    #[test]
    fn artifact_names_are_recognised() {
        assert!(is_artifact_name("node_modules"));
        assert!(is_artifact_name("obj"));
        assert!(!is_artifact_name("src"));
        assert!(!is_artifact_name("dist"));
    }
}
