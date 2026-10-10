// Shared Tauri app builder. Desktop uses the `talia-ai` binary; Android/iOS
// enter through this library (mobile_entry_point), which is why the app
// logic lives here rather than in main.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// `app.updater_builder()` comes from this trait — without it in scope the
// auto-update loop won't compile. Desktop-only, like the plugin itself.
#[cfg(not(target_os = "android"))]
use tauri_plugin_updater::UpdaterExt;

const API_PORT: u16 = 8787;

fn api_up() -> bool {
    TcpStream::connect(("127.0.0.1", API_PORT)).is_ok()
}

fn host_triple() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("windows", "aarch64") => "aarch64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        _ => "",
    }
}

/// Find the sidecar binary. Depending on platform/bundler it may live as
/// `<resources>/binaries/talia-server-<triple>`, be flattened to
/// `<exe-dir>/talia-server`, or sit in `src-tauri/binaries/` during dev.
fn find_sidecar(app: &tauri::AppHandle) -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let res_dir = app
        .path()
        .resource_dir()
        .ok()
        .unwrap_or_else(|| PathBuf::from("/nonexistent"));
    let triple = host_triple();
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let names = [
        format!("talia-server-{triple}{ext}"),
        format!("talia-server{ext}"),
    ];
    // Bundled layouts first; the compile-time dev dir is a last resort so
    // `cargo run` works from a fresh checkout.
    let bases = [
        res_dir.join("binaries"),
        res_dir,
        exe_dir,
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries"), // dev
    ];
    for base in &bases {
        for name in &names {
            let candidate = base.join(name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Background self-updater (desktop only). Checks the signed release feed on a
/// relaxed cadence, downloads + verifies the installer against the public key
/// baked in at build time, then restarts into it. Any failure is logged and
/// swallowed — updating must never take the app down. Set `TALIA_NO_AUTOUPDATE=1`
/// to opt out (e.g. for kiosk or managed installs).
#[cfg(not(target_os = "android"))]
fn spawn_auto_updater(app: tauri::AppHandle) {
    if std::env::var("TALIA_NO_AUTOUPDATE").is_ok() {
        return;
    }
    // Runs on its own OS thread so it can never stall the UI event loop. The
    // updater's calls are async; we drive them with tauri's own block_on bridge.
    std::thread::spawn(move || {
        // How often to look for a new version.
        const CHECK_INTERVAL_SECS: u64 = 4 * 60 * 60;
        // Give the sidecar/window a moment to settle before the first check so
        // we never race startup or interrupt a first-run quickstart.
        const FIRST_DELAY_SECS: u64 = 45;

        std::thread::sleep(Duration::from_secs(FIRST_DELAY_SECS));
        loop {
            let updater = match app.updater_builder().build() {
                Ok(u) => u,
                Err(err) => {
                    eprintln!("[talia] updater unavailable: {err}");
                    return;
                }
            };
            // `check` and `download_and_install` are async; they do their own
            // tokio work under the hood, so drive them on the app's runtime.
            let maybe_update = tauri::async_runtime::block_on(updater.check());
            match maybe_update {
                Ok(Some(update)) => {
                    println!(
                        "[talia] update {} available — downloading in the background…",
                        update.version
                    );
                    let mut last_logged = 0u8;
                    let installed = tauri::async_runtime::block_on(update.download_and_install(
                        move |chunk, total| {
                            // Log download progress in ~25% steps, not every chunk.
                            if let Some(_t) = total {
                                let pct = ((chunk as u64).saturating_mul(100) / _t.max(1)) as u8;
                                let bucket = (pct / 25) * 25;
                                if bucket != last_logged {
                                    last_logged = bucket;
                                    println!("[talia] update download {bucket}%");
                                }
                            }
                        },
                        || println!("[talia] update downloaded — verifying & installing…"),
                    ));
                    match installed {
                        // `restart()` diverges (`-> !`), so it must be the tail
                        // expression of its own block — never fall through to a
                        // following statement or the diverging type won't unify.
                        Ok(()) => {
                            println!("[talia] update installed — restarting to apply it");
                            app.restart()
                        }
                        Err(err) => eprintln!("[talia] update install failed (will retry): {err}"),
                    }
                }
                Ok(None) => { /* already current */ }
                Err(err) => eprintln!("[talia] update check failed (will retry): {err}"),
            }
            std::thread::sleep(Duration::from_secs(CHECK_INTERVAL_SECS));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // Desktop-only: tauri-plugin-single-instance exposes no `init` on mobile.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    // Auto-update (desktop only): Android gets updates from the Play Store.
    // The updater reads `plugins.updater.endpoints` + `pubkey` from
    // tauri.conf.json and verifies the signature before swapping the app.
    #[cfg(not(target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            #[cfg(target_os = "android")]
            {
                // Android is a thin client: the API runs on your computer
                // (the desktop app or `npm run server`), the UI shows its
                // connect banner and talks to it over the network. The UI
                // itself comes from the bundled dist (tauri://localhost).
                return Ok(());
            }

            #[cfg(not(target_os = "android"))]
            {
                // The sidecar serves the frontend from dist/ (same as
                // standalone `npm run server`), so point it at the bundled
                // resources copy.
                let dist_dir = app
                    .path()
                    .resource_dir()
                    .ok()
                    .map(|r| r.join("dist"))
                    .filter(|d| d.join("index.html").exists())
                    .or_else(|| {
                        let d = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
                        d.join("index.html").exists().then_some(d)
                    });

                // Start the bundled Express sidecar unless something is
                // already listening on the API port (e.g. `npm run dev:server`).
                if !api_up() {
                    let Some(sidecar_path) = find_sidecar(app.handle()) else {
                        return Err("talia-server sidecar binary not found in bundle".into());
                    };
                    let mut cmd = app
                        .shell()
                        .command(sidecar_path)
                        .env("PORT", API_PORT.to_string());
                    if let Some(dist) = dist_dir {
                        cmd = cmd.env("TALIA_DIST_DIR", dist);
                    }
                    let (mut rx, _child) = cmd
                        .spawn()
                        .expect("failed to spawn the talia-server sidecar");
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    println!("[talia] {}", String::from_utf8_lossy(&line))
                                }
                                CommandEvent::Stderr(line) => {
                                    eprintln!("[talia] {}", String::from_utf8_lossy(&line))
                                }
                                CommandEvent::Error(line) => eprintln!("[talia:err] {line}"),
                                CommandEvent::Terminated(status) => {
                                    eprintln!("[talia] sidecar exited: {status:?}")
                                }
                                _ => {}
                            }
                        }
                    });
                }

                // Give the API a moment to come up before navigating.
                let deadline = Instant::now() + Duration::from_secs(30);
                while !api_up() && Instant::now() < deadline {
                    std::thread::sleep(Duration::from_millis(100));
                }

                let window = app.get_webview_window("main").expect("main window missing");
                if api_up() {
                    let _ = window.navigate(
                        tauri::Url::parse(&format!("http://localhost:{API_PORT}/")).unwrap(),
                    );
                } else {
                    // The sidecar sometimes loses the first-launch race (first
                    // read, antivirus scan…). Don't strand the window on the
                    // bundled shell: retry in the background and navigate the
                    // moment the server answers. Re-launching the app is safe
                    // (the sidecar step is skipped while the port is up), and
                    // covers the case where the sidecar crashed on boot.
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        for attempt in 1..=12u32 {
                            if api_up() {
                                if let Some(w) = handle.get_webview_window("main") {
                                    let _ = w.navigate(
                                        tauri::Url::parse(&format!("http://localhost:{API_PORT}/")).unwrap(),
                                    );
                                }
                                return;
                            }
                            if attempt % 4 == 0 {
                                let _ = std::process::Command::new("open")
                                    .arg("-a")
                                    .arg("Talia AI")
                                    .output();
                            }
                            std::thread::sleep(std::time::Duration::from_secs(5));
                        }
                    });
                }
                // If the API never came up, the window stays on the bundled
                // offline shell (dist/index.html), which shows the offline banner.

                // Kick off background self-update now that the UI is settled.
                // cfg-gated: Android gets its updates from the Play Store, and
                // the updater crate isn't even compiled into that target.
                #[cfg(not(target_os = "android"))]
                spawn_auto_updater(app.handle().clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running talia");
}
