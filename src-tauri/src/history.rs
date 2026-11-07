//! Clean history, persisted locally with tauri-plugin-store (`history.json` in the app data dir).

use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::model::CleanReport;

const FILE: &str = "history.json";
const KEY: &str = "runs";
const MAX_RUNS: usize = 200;

fn load<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<CleanReport>, String> {
    let store = app.store(FILE).map_err(|e| e.to_string())?;
    Ok(store
        .get(KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

/// Newest first.
pub fn list<R: Runtime>(app: &AppHandle<R>, limit: usize) -> Result<Vec<CleanReport>, String> {
    let mut runs = load(app)?;
    runs.truncate(limit);
    Ok(runs)
}

pub fn append<R: Runtime>(app: &AppHandle<R>, report: &CleanReport) -> Result<(), String> {
    let mut runs = load(app)?;
    runs.insert(0, report.clone());
    runs.truncate(MAX_RUNS);
    let store = app.store(FILE).map_err(|e| e.to_string())?;
    store.set(KEY, serde_json::to_value(&runs).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}
