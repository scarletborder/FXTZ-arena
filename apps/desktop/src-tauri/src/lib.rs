use std::{
    fs,
    io::Write,
    net::UdpSocket,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use tauri::{Emitter, State};

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
fn udp_listen(app: tauri::AppHandle, state: State<'_, UdpState>, port: u16) -> Result<String, String> {
    stop_udp_socket(state.inner())?;

    let socket = Arc::new(UdpSocket::bind(("0.0.0.0", port)).map_err(|error| error.to_string())?);
    socket
        .set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|error| error.to_string())?;
    let local_addr = socket.local_addr().map_err(|error| error.to_string())?.to_string();

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
    socket.send_to(&data, addr).map_err(|error| error.to_string())?;
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
fn append_client_log(line: String, path: String) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn stop_udp_socket(state: &UdpState) -> Result<(), String> {
    state.running.store(false, Ordering::SeqCst);
    state.session.fetch_add(1, Ordering::SeqCst);
    *state.socket.lock().map_err(|error| error.to_string())? = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(UdpState::default())
        .manage(link::wt::WtState::default())
        .invoke_handler(tauri::generate_handler![
            udp_listen,
            udp_send,
            udp_stop,
            save_debug_log,
            append_client_log,
            link::wt::wt_connect,
            link::wt::wt_send,
            link::wt::wt_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
