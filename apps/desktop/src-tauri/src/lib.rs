use std::{
    env, fs,
    io::Write,
    net::UdpSocket,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use tauri::{Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

mod link;

#[derive(Clone, serde::Serialize)]
struct UdpPayload {
    addr: String,
    data: Vec<u8>,
}

#[derive(Default)]
struct UdpState {
    socket: Mutex<Option<Arc<UdpSocket>>>,
    running: Arc<AtomicBool>,
    session: Arc<AtomicU64>,
}

#[tauri::command]
fn udp_listen(
    app: tauri::AppHandle,
    state: State<'_, UdpState>,
    port: u16,
) -> Result<String, String> {
    stop_udp_socket(state.inner())?;

    let socket = Arc::new(UdpSocket::bind(("0.0.0.0", port)).map_err(|error| error.to_string())?);
    socket
        .set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|error| error.to_string())?;
    let local_addr = socket
        .local_addr()
        .map_err(|error| error.to_string())?
        .to_string();

    let session = state.session.fetch_add(1, Ordering::SeqCst) + 1;
    state.running.store(true, Ordering::SeqCst);
    *state.socket.lock().map_err(|error| error.to_string())? = Some(socket.clone());

    let running = state.running.clone();
    let state_session = state.inner().session.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 65535];
        while running.load(Ordering::SeqCst) && state_session.load(Ordering::SeqCst) == session {
            match socket.recv_from(&mut buf) {
                Ok((size, src)) => {
                    let _ = app.emit(
                        "udp-receive",
                        UdpPayload {
                            addr: src.to_string(),
                            data: buf[..size].to_vec(),
                        },
                    );
                }
                Err(error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        || error.kind() == std::io::ErrorKind::TimedOut => {}
                Err(error) => {
                    let _ = app.emit("udp-error", error.to_string());
                    break;
                }
            }
        }
    });

    Ok(local_addr)
}

#[tauri::command]
fn udp_send(state: State<'_, UdpState>, addr: String, data: Vec<u8>) -> Result<(), String> {
    let socket = state.socket.lock().map_err(|error| error.to_string())?;
    let socket = socket
        .as_ref()
        .ok_or_else(|| "UDP socket is not listening".to_string())?;
    socket
        .send_to(&data, addr)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn udp_stop(state: State<'_, UdpState>) -> Result<(), String> {
    stop_udp_socket(state.inner())
}

#[tauri::command]
fn save_debug_log(filename: String, text: String) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_file_name(filename)
        .add_filter("JSON", &["json"])
        .save_file();

    let Some(path) = path else {
        return Ok(None);
    };

    fs::write(&path, text).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn select_log_directory() -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new().pick_folder();
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn append_client_log(line: String, path: String) -> Result<(), String> {
    // Ensure parent directory exists
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Replay file storage  —  read/write/delete in a "replay/" dir next to the exe
// ---------------------------------------------------------------------------

fn replay_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("replay");

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn replay_data_filename(slot_index: u32) -> String {
    format!("fxtz_replay_{:02}", slot_index)
}

fn legacy_replay_meta_filename(slot_index: u32) -> String {
    format!("fxtz_replay_{:02}.json", slot_index)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ReplaySlotData {
    data: Option<Vec<u8>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateProgressPayload {
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRemoteUpdatePayload {
    version: String,
}

#[tauri::command]
fn replay_save_slot(app: tauri::AppHandle, slot_index: u32, data: Vec<u8>) -> Result<(), String> {
    let dir = replay_dir(&app)?; // 💡 传入 app 句柄
    let data_path = dir.join(replay_data_filename(slot_index));
    std::fs::write(&data_path, data).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dir.join(legacy_replay_meta_filename(slot_index)));
    Ok(())
}

#[tauri::command]
fn replay_load_slot(app: tauri::AppHandle, slot_index: u32) -> Result<ReplaySlotData, String> {
    let dir = replay_dir(&app)?; // 💡 传入 app 句柄
    let data_path = dir.join(replay_data_filename(slot_index));
    Ok(ReplaySlotData {
        data: if data_path.exists() {
            Some(std::fs::read(&data_path).map_err(|e| e.to_string())?)
        } else {
            None
        },
    })
}

#[tauri::command]
fn replay_delete_slot(app: tauri::AppHandle, slot_index: u32) -> Result<(), String> {
    let dir = replay_dir(&app)?; // 💡 传入 app 句柄
    let _ = std::fs::remove_file(dir.join(replay_data_filename(slot_index)));
    let _ = std::fs::remove_file(dir.join(legacy_replay_meta_filename(slot_index)));
    Ok(())
}

#[tauri::command]
fn replay_export_slot(slot_index: u32, data: Vec<u8>) -> Result<Option<String>, String> {
    let default_name = format!("fxtz_replay_{:02}", slot_index);
    let path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .save_file();
    let Some(path) = path else {
        return Ok(None);
    };
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn replay_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = replay_dir(&app)?; // 💡 传入 app 句柄
    let path_str = dir.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Profile file storage  —  one JSON file per Profile in "Profiles/"
// ---------------------------------------------------------------------------

fn profiles_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("Profiles");

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn profile_filename(profile_id: &str) -> String {
    let encoded = profile_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>();
    format!("profile_{}.json", encoded)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ProfileFileData {
    data: String,
}

#[tauri::command]
fn profile_list_files(app: tauri::AppHandle) -> Result<Vec<ProfileFileData>, String> {
    let dir = profiles_dir(&app)?;
    let mut profiles = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        profiles.push(ProfileFileData { data });
    }
    Ok(profiles)
}

#[tauri::command]
fn profile_save_file(
    app: tauri::AppHandle,
    profile_id: String,
    data: String,
) -> Result<(), String> {
    let dir = profiles_dir(&app)?;
    std::fs::write(dir.join(profile_filename(&profile_id)), data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn profile_delete_file(app: tauri::AppHandle, profile_id: String) -> Result<(), String> {
    let dir = profiles_dir(&app)?;
    let _ = std::fs::remove_file(dir.join(profile_filename(&profile_id)));
    Ok(())
}

#[tauri::command]
async fn desktop_update_and_install_if_available(app: tauri::AppHandle) -> Result<bool, String> {
    let Some(updater) = build_updater(&app)? else {
        return Ok(false);
    };

    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(false);
    };

    let progress_app = app.clone();
    let mut downloaded_bytes = 0_u64;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded_bytes += chunk_length as u64;
                let _ = progress_app.emit(
                    "desktop-update-progress",
                    DesktopUpdateProgressPayload {
                        downloaded_bytes,
                        total_bytes: content_length,
                    },
                );
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
async fn desktop_remote_update_version(
    app: tauri::AppHandle,
) -> Result<Option<DesktopRemoteUpdatePayload>, String> {
    let Some(updater) = build_updater(&app)? else {
        return Ok(None);
    };

    let update = updater.check().await.map_err(|error| error.to_string())?;
    Ok(update.map(|update| DesktopRemoteUpdatePayload {
        version: update.version,
    }))
}

fn stop_udp_socket(state: &UdpState) -> Result<(), String> {
    state.running.store(false, Ordering::SeqCst);
    state.session.fetch_add(1, Ordering::SeqCst);
    *state.socket.lock().map_err(|error| error.to_string())? = None;
    Ok(())
}

fn copy_dir_all(
    src: impl AsRef<std::path::Path>,
    dst: impl AsRef<std::path::Path>,
) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(UdpState::default())
        .manage(link::wt::WtState::default())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let app_handle = app.handle();

            // 💡 1. 动态定位到当前可用的 AppLocalData 目录
            if let Ok(local_data_dir) = app_handle.path().app_local_data_dir() {
                let local_assets_dir = local_data_dir.join("game_assets");

                // 💡 2. 如果 AppLocalData 还没有资源文件夹（说明是首次启动）
                if !local_assets_dir.exists() {
                    // 💡 3. 尝试解析安装包附带的只读内置资源路径 (对应 setup.exe 安装场景)
                    if let Ok(resource_assets_dir) = app_handle
                        .path()
                        .resolve("../resource-assets", tauri::path::BaseDirectory::Resource)
                    {
                        if resource_assets_dir.exists() {
                            println!("检测到安装包内置资源，正在离线同步至 AppLocalData...");
                            if let Err(err) = copy_dir_all(&resource_assets_dir, &local_assets_dir)
                            {
                                eprintln!("离线资源同步失败: {}", err);
                            } else {
                                println!("离线资源成功同步至 AppLocalData！");
                            }
                        } else {
                            println!("未找到安装包内置资源（当前运行的可能是免安装绿色版）。");
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            udp_listen,
            udp_send,
            udp_stop,
            save_debug_log,
            append_client_log,
            select_log_directory,
            replay_save_slot,
            replay_load_slot,
            replay_delete_slot,
            replay_export_slot,
            replay_open_folder,
            profile_list_files,
            profile_save_file,
            profile_delete_file,
            desktop_remote_update_version,
            desktop_update_and_install_if_available,
            link::wt::wt_connect,
            link::wt::wt_send,
            link::wt::wt_close,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_updater<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Option<tauri_plugin_updater::Updater>, String> {
    let mut builder = app.updater_builder();
    if let Some(endpoint) = configured_value(
        "TAURI_UPDATER_ENDPOINT",
        option_env!("TAURI_UPDATER_ENDPOINT"),
    ) {
        let endpoint = endpoint.parse::<Url>().map_err(|error| error.to_string())?;
        builder = builder
            .endpoints(vec![endpoint])
            .map_err(|error| error.to_string())?;
    }
    if let Some(pubkey) =
        configured_value("TAURI_UPDATER_PUBKEY", option_env!("TAURI_UPDATER_PUBKEY"))
    {
        builder = builder.pubkey(pubkey);
    }

    builder.build().map(Some).map_err(|error| error.to_string())
}

fn configured_value(name: &str, build_time_value: Option<&'static str>) -> Option<String> {
    env::var(name)
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            build_time_value
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
}
