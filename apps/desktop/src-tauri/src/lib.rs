//! PHASE-021 — Tauri v2 shell (Windows-only this phase; macOS/Linux require a
//! decision record, PHASE-021 §7). Wraps the static export of apps/web and
//! hosts: SQLCipher local DB (key from OS keychain), keychain plugin,
//! signed updater with staged rollout, crash recovery (IN_FLIGHT → QUEUED on
//! every start), WebView2 minimum-version probe, ESC/POS printer plugin.
//! Native build/signing runs in CI (.github/workflows/desktop-release.yml);
//! this file is the reviewed source of the shell.

use tauri::Manager;

mod webview2;

#[tauri::command]
fn webview2_runtime_version(app: tauri::AppHandle) -> Option<String> {
    webview2::installed_version(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_keyring::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .setup(|app| {
            // WebView2 probe BEFORE first paint: below minimum → system-requirements
            // path in the web UI (no crash); supported-older → degraded notice.
            let version = webview2::installed_version(app.handle());
            app.manage(webview2::ProbeState(version));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![webview2_runtime_version])
        .run(tauri::generate_context!())
        .expect("error while running ERP Desktop");
}
