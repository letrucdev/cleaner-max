//! Recycle bin via the Shell API. `Clear-RecycleBin` in PowerShell reports spurious
//! "path not found" errors on machines with drives that have no recycle bin, so we call
//! `SHQueryRecycleBinW` / `SHEmptyRecycleBinW` directly.

use windows::Win32::UI::Shell::{
    SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND, SHEmptyRecycleBinW, SHQUERYRBINFO,
    SHQueryRecycleBinW,
};
use windows::core::PCWSTR;

use crate::model::RecycleBinInfo;

/// Size and item count of the recycle bins on all drives.
pub fn query() -> RecycleBinInfo {
    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        ..Default::default()
    };
    // SAFETY: `info` is a valid, correctly sized SHQUERYRBINFO; a null root means "all drives".
    match unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) } {
        Ok(()) => RecycleBinInfo {
            size: info.i64Size.max(0) as f64,
            items: info.i64NumItems.max(0) as f64,
        },
        Err(e) => {
            log::warn!("SHQueryRecycleBinW failed: {e}");
            RecycleBinInfo {
                size: 0.0,
                items: 0.0,
            }
        }
    }
}

/// Empty every drive's recycle bin without UI. Returns bytes freed.
pub fn empty() -> Result<f64, String> {
    let before = query();
    if before.items == 0.0 {
        return Ok(0.0);
    }
    // SAFETY: no window handle, null root (= all drives), documented flag values.
    let res = unsafe {
        SHEmptyRecycleBinW(
            None,
            PCWSTR::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
        )
    };
    let after = query();
    let freed = (before.size - after.size).max(0.0);
    match res {
        Ok(()) => Ok(freed),
        // The call can report an error even though it emptied the bin; trust the measurement.
        Err(_) if after.items == 0.0 => Ok(freed),
        Err(e) => Err(format!("SHEmptyRecycleBinW: {e}")),
    }
}
