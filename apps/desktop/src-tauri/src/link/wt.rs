use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};

use tauri::{Emitter, State};
use tokio::sync::mpsc;
use wtransport::{ClientConfig, Endpoint};

#[derive(Clone, serde::Serialize)]
pub struct WtPayload {
    pub data: Vec<u8>,
}

#[derive(Default)]
pub struct WtState {
    pub tx: Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>,
    pub running: Arc<AtomicBool>,
    pub session: Arc<AtomicU64>,
}

#[tauri::command]
pub fn wt_connect(app: tauri::AppHandle, state: State<'_, WtState>, url: String) -> Result<(), String> {
    stop_wt(state.inner());

    let session = state.session.fetch_add(1, Ordering::SeqCst) + 1;
    state.running.store(true, Ordering::SeqCst);

    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    *state.tx.lock().map_err(|error| error.to_string())? = Some(tx);

    let running = state.running.clone();
    let session_state = state.session.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            let config = ClientConfig::builder()
                .with_bind_default()
                .with_no_cert_validation()
                .build();
            let connection = Endpoint::client(config)
                .map_err(|error| error.to_string())?
                .connect(url)
                .await
                .map_err(|error| error.to_string())?;
            let (mut send, mut recv) = connection
                .open_bi()
                .await
                .map_err(|error| error.to_string())?
                .await
                .map_err(|error| error.to_string())?;

            let _ = app.emit("wt-open", ());

            let mut buf = [0u8; 64 * 1024];
            loop {
                if !running.load(Ordering::SeqCst) || session_state.load(Ordering::SeqCst) != session {
                    break;
                }

                tokio::select! {
                    incoming = recv.read(&mut buf) => {
                        let size = incoming.map_err(|error| error.to_string())?;
                        match size {
                            Some(n) => {
                                let _ = app.emit("wt-receive", WtPayload { data: buf[..n].to_vec() });
                            }
                            None => break,
                        }
                    }
                    outgoing = rx.recv() => {
                        match outgoing {
                            Some(data) => {
                                send.write_all(&data).await.map_err(|error| error.to_string())?;
                            }
                            None => break,
                        }
                    }
                }
            }

            Ok::<(), String>(())
        };

        if let Err(error) = result.await {
            let _ = app.emit("wt-error", error);
        }
        let _ = app.emit("wt-close", ());
    });

    Ok(())
}

#[tauri::command]
pub fn wt_send(state: State<'_, WtState>, data: Vec<u8>) -> Result<(), String> {
    let sender = state.tx.lock().map_err(|error| error.to_string())?;
    let sender = sender.as_ref().ok_or_else(|| "WT is not connected".to_string())?;
    sender.send(data).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn wt_close(state: State<'_, WtState>) -> Result<(), String> {
    stop_wt(state.inner());
    Ok(())
}

fn stop_wt(state: &WtState) {
    state.running.store(false, Ordering::SeqCst);
    state.session.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut tx) = state.tx.lock() {
        tx.take();
    }
}
