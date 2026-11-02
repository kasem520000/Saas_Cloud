//! PHASE-021 T11 — WebView2 runtime probe (RISK-017). Reads the installed
//! WebView2 runtime version from the registry (HKLM/HKCU EdgeUpdate
////  ClientState key). The web shell calls `webview2_runtime_version` at boot
//! and routes through sync-core's `probeWebView2` (unit-tested): below
//! minimum → system-requirements path; supported-older → degraded notice.

use tauri::AppHandle;

pub struct ProbeState(pub Option<String>);

#[cfg(target_os = "windows")]
pub fn installed_version(_app: &AppHandle) -> Option<String> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ,
        REG_SZ,
    };
    const SUBKEY: &str = "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\ClientState\\{56226A42-EE75-4C87-BA75-E32FAAE3C9B5}";
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        unsafe {
            let mut hkey = HKEY::default();
            let sub = HSTRING::from(SUBKEY);
            if RegOpenKeyExW(root, &sub.into(), 0, KEY_READ, &mut hkey).is_ok() {
                let mut buf = [0u16; 64];
                let mut len = (buf.len() * 2) as u32;
                let name = HSTRING::from("pv");
                let mut ty = REG_SZ;
                if RegQueryValueExW(hkey, &name.into(), None, Some(&mut ty), Some(buf.as_mut_ptr() as *mut u8), Some(&mut len)).is_ok() {
                    return Some(String::from_utf16_lossy(&buf[..len as usize / 2]));
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
pub fn installed_version(_app: &AppHandle) -> Option<String> {
    None
}
