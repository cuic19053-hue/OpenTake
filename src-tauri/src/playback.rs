//! MJPEG preview stream server (#64).
//!
//! Spawns a loopback axum HTTP server that pushes composited frames as
//! `multipart/x-mixed-replace` JPEG so the WebView can consume a single image
//! stream during playback — the transport layer for the "single render surface"
//! model described in #142.
//!
//! The server binds `127.0.0.1:0` (random port) on app startup and is managed
//! as Tauri state. `composite_frame` pushes JPEG bytes into a `broadcast`
//! channel; the `/stream` endpoint relays them to any connected `<img>`.

use bytes::Bytes;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast;

// ---------------------------------------------------------------------------
// PreviewServer
// ---------------------------------------------------------------------------

/// Shared MJPEG preview server state: the bound port and the frame broadcast
/// channel sender. The axum `Serve` handle is owned by the spawned task and
/// shuts down when this `Arc` is dropped (app exit).
pub struct PreviewServer {
    port: u16,
    tx: broadcast::Sender<Bytes>,
}

impl PreviewServer {
    /// Start the MJPEG server on a random loopback port.
    ///
    /// Must be called from a context where the Tauri async runtime is active
    /// (i.e. inside `setup` via `tauri::async_runtime::block_on`).
    pub async fn start() -> Result<Arc<Self>, String> {
        let (tx, _) = broadcast::channel::<Bytes>(2);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("MJPEG bind: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("MJPEG local_addr: {e}"))?
            .port();

        let tx_clone = tx.clone();
        tauri::async_runtime::spawn(async move {
            let app = axum::Router::new()
                .route("/stream", axum::routing::get(stream_handler))
                .with_state(tx_clone);
            if let Err(e) = axum::serve(listener, app).await {
                eprintln!("[mjpeg] server error: {e}");
            }
        });

        Ok(Arc::new(Self { port, tx }))
    }

    /// The MJPEG stream URL for the front end to point an `<img>` at.
    pub fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}/stream", self.port)
    }

    /// Obtain a clone of the broadcast sender (for `composite_frame` to push
    /// JPEG frames into).
    pub fn sender(&self) -> broadcast::Sender<Bytes> {
        self.tx.clone()
    }
}

// ---------------------------------------------------------------------------
// Axum handler
// ---------------------------------------------------------------------------

/// MJPEG `/stream` endpoint: subscribes to the broadcast channel and relays
/// each JPEG frame as a `multipart/x-mixed-replace` part.
async fn stream_handler(
    axum::extract::State(tx): axum::extract::State<broadcast::Sender<Bytes>>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    let mut rx = tx.subscribe();
    let boundary = "opentake_mjpeg_boundary";

    // Use an unbounded mpsc channel to bridge broadcast -> axum Body stream.
    let (body_tx, body_rx) = tokio::sync::mpsc::unbounded_channel::<Result<Bytes, Infallible>>();

    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(jpeg) => {
                    let header = format!(
                        "\r\n--{}\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
                        boundary,
                        jpeg.len()
                    );
                    if body_tx.send(Ok(Bytes::from(header))).is_err() {
                        break; // client disconnected
                    }
                    if body_tx.send(Ok(jpeg)).is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    eprintln!("[mjpeg] lagged {n} frames, continuing");
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Wrap the tokio UnboundedReceiver as a futures Stream for axum.
    let stream = futures::stream::unfold(body_rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    });
    let body = axum::body::Body::from_stream(stream);
    (
        [
            (
                "content-type",
                format!("multipart/x-mixed-replace; boundary={boundary}"),
            ),
            ("cache-control", "no-cache".to_string()),
        ],
        body,
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

/// Return the MJPEG stream endpoint URL so the front end can connect.
#[tauri::command]
pub fn get_preview_endpoint(server: tauri::State<'_, Arc<PreviewServer>>) -> String {
    server.endpoint()
}
