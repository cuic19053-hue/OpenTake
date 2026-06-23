//! Full-timeline video export (`export_video`).
//!
//! This is the export counterpart to the single-frame preview path
//! ([`crate::render::composite_frame`]): it walks **every** frame of the current
//! timeline, composites each on the GPU through the ready-made wgpu compositor
//! (`opentake-render`), and pipes the RGBA frames into the system ffmpeg encoder
//! (`opentake_media::VideoEncoder`) to produce a real `.mp4` on disk.
//!
//! Scope of this first cut (SPEC §2.4 / §8.2):
//! - **Pure video** (no audio mix), **H.264 / .mp4** only. The encoder already
//!   supports H.265 / ProRes presets and an audio side-channel; those land in a
//!   follow-up so this slice stays a clean, verifiable spine.
//! - Export renders at the **full** export resolution
//!   ([`opentake_render::export_render_size`]), not the preview cap.
//! - No progress callback / cancellation yet (the orchestrator runs to
//!   completion under the GPU lock, one frame at a time).
//!
//! The manifest/text projection, [`opentake_render::SourceMetrics`] adapter, and
//! the on-demand ffmpeg [`opentake_render::TextureResolver`] are intentionally a
//! self-contained copy of the preview path's logic (kept in this module so the
//! preview path in `render.rs` is not touched). A later refactor can hoist the
//! shared projection into a `pub(crate)` helper once both paths are stable.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::rc::Rc;

use serde::{Deserialize, Serialize};
use tauri::State;

use opentake_core::AppCore;
use opentake_domain::{ClipType, MediaSource, TextStyle};
use opentake_media::{
    decode_frame_at, ExportPreset, ExportResolution as EncodeResolution, FrameRequest, RgbaFrame,
    VideoCodec, VideoEncoder,
};
use opentake_render::gpu::texture::upload_rgba;
use opentake_render::{
    build_render_plan, export_render_size, Compositor, CosmicTextRasterizer, DecodedFrame,
    ExportResolution as RenderResolution, GpuTexture, RenderDevice, SourceMetrics,
    TextRasterRequest, TextRasterizer, TextureCache, TextureResolver, TextureSource,
};

/// Per-frame texture cache size. Export advances monotonically, so video-frame
/// hit rate is low; a small cache still helps text/image layers re-used across
/// frames. Bounds VRAM during the export loop.
const TEXTURE_CACHE_CAP: usize = 64;

/// Requested output codec, projected from the front-end. Only H.264 is wired in
/// this slice; the other variants are accepted by the type but rejected with a
/// clear error until their container/preset branches land.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportCodec {
    /// H.264 / `.mp4` (the only fully-wired path in this cut).
    #[default]
    H264,
    /// H.265 / `.mp4` (reserved — not yet wired).
    H265,
    /// Apple ProRes 422 / `.mov` (reserved — not yet wired).
    Prores,
}

/// Requested output short-edge resolution, projected from the front-end.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportQuality {
    #[serde(rename = "720p")]
    P720,
    #[default]
    #[serde(rename = "1080p")]
    P1080,
    #[serde(rename = "4k")]
    P4k,
}

impl ExportQuality {
    /// The render-crate resolution selector (drives `export_render_size`).
    fn render_resolution(self) -> RenderResolution {
        match self {
            ExportQuality::P720 => RenderResolution::R720p,
            ExportQuality::P1080 => RenderResolution::R1080p,
            ExportQuality::P4k => RenderResolution::R4k,
        }
    }

    /// The encoder-crate resolution selector (carried into the `ExportPreset`).
    fn encode_resolution(self) -> EncodeResolution {
        match self {
            ExportQuality::P720 => EncodeResolution::P720,
            ExportQuality::P1080 => EncodeResolution::P1080,
            ExportQuality::P4k => EncodeResolution::P2160,
        }
    }
}

/// Parameters for an export, projected from the front-end. `#[serde(default)]`
/// on the optional knobs keeps older callers (and partial payloads) working: a
/// bare `{ "outPath": "..." }` exports H.264 / 1080p.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    /// Absolute path to write the encoded video to. Must end in `.mp4` for the
    /// H.264 path.
    pub out_path: String,
    #[serde(default)]
    pub codec: ExportCodec,
    #[serde(default)]
    pub quality: ExportQuality,
}

/// Summary of a completed export, returned to the front-end.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    /// Absolute path the video was written to.
    pub out_path: String,
    /// Encoded width in pixels (even-ized export render size).
    pub width: u32,
    /// Encoded height in pixels.
    pub height: u32,
    /// Frames-per-second of the output (from the render plan).
    pub fps: i32,
    /// Number of frames written.
    pub frame_count: i32,
}

/// Resolve the requested codec to an ffmpeg [`ExportPreset`], rejecting the
/// not-yet-wired branches with a clear error. Also validates the output
/// extension matches the codec's container.
fn resolve_preset(
    codec: ExportCodec,
    quality: ExportQuality,
    out: &Path,
) -> Result<ExportPreset, String> {
    let ext = out
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match codec {
        ExportCodec::H264 => {
            if ext.as_deref() != Some("mp4") {
                return Err("H.264 export requires an .mp4 output path".to_string());
            }
            Ok(ExportPreset::new(
                VideoCodec::H264,
                quality.encode_resolution(),
            ))
        }
        // TODO(#export): wire H.265 (.mp4) and ProRes 422 (.mov) once their
        // container/preset branches are validated end-to-end. The encoder
        // already builds correct args for both; this command just hasn't opted
        // them in yet, so the export surface stays minimal and verifiable.
        ExportCodec::H265 => Err("H.265 export is not wired yet (TODO)".to_string()),
        ExportCodec::Prores => Err("ProRes export is not wired yet (TODO)".to_string()),
    }
}

/// Resolvable info for one media asset, projected from the manifest.
struct MediaInfo {
    path: PathBuf,
    /// Source frames-per-second (`0.0` when unknown → resolver falls back to 30).
    fps: f64,
}

/// A text clip projected from the timeline, keyed by clip id.
struct TextInfo {
    content: String,
    style: TextStyle,
    box_norm: (f64, f64, f64, f64),
}

/// `SourceMetrics` backed by the media manifest (intrinsic size only; ffmpeg
/// auto-rotates on decode in this cut).
struct ManifestMetrics {
    sizes: HashMap<String, (u32, u32)>,
}

impl SourceMetrics for ManifestMetrics {
    fn natural_size(&self, media_ref: &str) -> Option<(u32, u32)> {
        self.sizes.get(media_ref).copied()
    }
}

/// `TextureResolver` that decodes a layer's pixels on demand via ffmpeg and
/// uploads them to the GPU. Video keys per source-frame; images key once; text
/// rasterizes its box; Lottie returns `None` (skipped) in this cut. Mirrors the
/// preview resolver, but the decode box is the full export render size.
struct MediaResolver<'d> {
    device: &'d opentake_render::wgpu::Device,
    queue: &'d opentake_render::wgpu::Queue,
    cache: TextureCache,
    media: &'d HashMap<String, MediaInfo>,
    text: &'d HashMap<String, TextInfo>,
    text_rasterizer: &'d CosmicTextRasterizer,
    /// Decode/raster box for source frames (matches the export render size).
    render_box: (u32, u32),
}

impl MediaResolver<'_> {
    fn resolve_text(&mut self, clip_id: &str) -> Option<Rc<GpuTexture>> {
        let key = format!("t:{clip_id}");
        if let Some(tex) = self.cache.get(&key) {
            return Some(tex);
        }
        let info = self.text.get(clip_id)?;
        let req = TextRasterRequest {
            clip_id,
            content: &info.content,
            style: &info.style,
            box_norm: info.box_norm,
            canvas: self.render_box,
        };
        let frame = self.text_rasterizer.rasterize(&req)?;
        let tex = upload_rgba(self.device, self.queue, &frame, false, Some("export-text"));
        Some(self.cache.insert(key, tex))
    }
}

impl TextureResolver for MediaResolver<'_> {
    fn resolve(&mut self, source: &TextureSource, source_frame: i64) -> Option<Rc<GpuTexture>> {
        let (media_ref, key, is_image) = match source {
            TextureSource::Decoded { media_ref } => {
                (media_ref, format!("v:{media_ref}:{source_frame}"), false)
            }
            TextureSource::Image { media_ref } => (media_ref, format!("i:{media_ref}"), true),
            TextureSource::Text { clip_id } => return self.resolve_text(clip_id),
            TextureSource::Lottie { .. } => return None,
        };

        if let Some(tex) = self.cache.get(&key) {
            return Some(tex);
        }

        let info = self.media.get(media_ref)?;
        let time_secs = if is_image {
            0.0
        } else {
            let fps = if info.fps > 0.0 { info.fps } else { 30.0 };
            (source_frame.max(0) as f64) / fps
        };

        let req = FrameRequest {
            time_secs,
            max_size: self.render_box,
            // Export advances frame-by-frame; a tight tolerance keeps each
            // composited frame on the exact target time (quality over the
            // scrub-oriented wide tolerance the preview uses).
            tolerance_secs: 0.0,
            apply_rotation: true,
        };
        let (_actual, frame) = decode_frame_at(&info.path, &req).ok()?;
        let decoded = DecodedFrame::new(frame.width, frame.height, frame.rgba, false);
        let tex = upload_rgba(self.device, self.queue, &decoded, false, Some("export-src"));
        Some(self.cache.insert(key, tex))
    }
}

/// Project the timeline's text clips (content + style + box) into the per-clip
/// lookup the resolver rasterizes from. Keyed by clip id.
fn project_text(timeline: &opentake_domain::Timeline) -> HashMap<String, TextInfo> {
    let mut text: HashMap<String, TextInfo> = HashMap::new();
    for track in &timeline.tracks {
        for clip in &track.clips {
            if clip.media_type != ClipType::Text {
                continue;
            }
            let (Some(content), Some(style)) = (&clip.text_content, &clip.text_style) else {
                continue;
            };
            let tl = clip.transform.top_left();
            text.insert(
                clip.id.clone(),
                TextInfo {
                    content: content.clone(),
                    style: style.clone(),
                    box_norm: (tl.x, tl.y, clip.transform.width, clip.transform.height),
                },
            );
        }
    }
    text
}

/// Project the media manifest into the render-side `(sizes, media)` lookups,
/// resolving project-relative paths against `project_dir`.
fn project_media(
    manifest: &opentake_domain::MediaManifest,
    project_dir: &Option<PathBuf>,
) -> (HashMap<String, (u32, u32)>, HashMap<String, MediaInfo>) {
    let mut sizes: HashMap<String, (u32, u32)> = HashMap::new();
    let mut media: HashMap<String, MediaInfo> = HashMap::new();
    for entry in &manifest.entries {
        let path = match &entry.source {
            MediaSource::External { absolute_path } => PathBuf::from(absolute_path),
            MediaSource::Project { relative_path } => match project_dir {
                Some(base) => base.join(relative_path),
                None => continue,
            },
        };
        if let (Some(w), Some(h)) = (entry.source_width, entry.source_height) {
            if w > 0 && h > 0 {
                sizes.insert(entry.id.clone(), (w as u32, h as u32));
            }
        }
        media.insert(
            entry.id.clone(),
            MediaInfo {
                path,
                fps: entry.source_fps.unwrap_or(0.0),
            },
        );
    }
    (sizes, media)
}

/// `export_video`: render the whole timeline to a video file on disk.
///
/// Composites every frame at the full export resolution and encodes them to
/// `req.out_path` (H.264 / .mp4 in this cut). An empty timeline still produces a
/// valid (possibly zero-frame) file — out-of-range frames composite to opaque
/// black, which is the correct clear color, not an error.
///
/// GPU acquisition / decode / encode failures surface to the front-end as
/// `Err(String)` (the Tauri boundary contract).
#[tauri::command]
pub fn export_video(core: State<'_, AppCore>, req: ExportRequest) -> Result<ExportSummary, String> {
    // Snapshot the session up front; no session lock is held during GPU/encode.
    let timeline = core.get_timeline().timeline;
    let manifest = core.media();
    let project_dir = core.project_dir();
    run_export(&timeline, &manifest, &project_dir, &req)
}

/// The export orchestration, decoupled from Tauri/`AppCore` so it can be driven
/// directly by an ffmpeg-gated integration test with a hand-built timeline +
/// manifest. The command wrapper only snapshots the live session and delegates
/// here. `pub` for the integration test in `tests/export_integration.rs`.
pub fn run_export(
    timeline: &opentake_domain::Timeline,
    manifest: &opentake_domain::MediaManifest,
    project_dir: &Option<PathBuf>,
    req: &ExportRequest,
) -> Result<ExportSummary, String> {
    let out_path = PathBuf::from(&req.out_path);
    let preset = resolve_preset(req.codec, req.quality, &out_path)?;

    let text = project_text(timeline);
    let (sizes, media) = project_media(manifest, project_dir);

    let render_size = export_render_size(
        (timeline.width, timeline.height),
        req.quality.render_resolution(),
    );

    let metrics = ManifestMetrics { sizes };
    let plan = build_render_plan(timeline, render_size, &metrics);

    // Acquire the GPU device + compositor for this export. Unlike the preview
    // (which caches the context in Tauri state for repeated scrubs), an export is
    // a one-shot batch, so a local context is simplest and avoids contending with
    // the preview's lock.
    let dev = RenderDevice::try_new().map_err(|e| format!("no GPU device: {e}"))?;
    let compositor = Compositor::new(&dev.device);
    let text_rasterizer = CosmicTextRasterizer::new();

    let mut encoder = VideoEncoder::new(
        &out_path,
        render_size.width,
        render_size.height,
        plan.fps,
        &preset,
    )
    .map_err(|e| format!("encoder init failed: {e}"))?;

    for f in 0..plan.total_frames {
        let frame_plan = plan.frame(timeline, f);
        let mut resolver = MediaResolver {
            device: &dev.device,
            queue: &dev.queue,
            cache: TextureCache::new(TEXTURE_CACHE_CAP),
            media: &media,
            text: &text,
            text_rasterizer: &text_rasterizer,
            render_box: (render_size.width, render_size.height),
        };
        let composite = compositor
            .render_to_rgba(
                &dev.device,
                &dev.queue,
                render_size,
                &frame_plan,
                &mut resolver,
            )
            .map_err(|e| format!("composite render failed at frame {f}: {e}"))?;
        encoder
            .push_frame(&RgbaFrame::new(
                composite.width,
                composite.height,
                composite.rgba,
            ))
            .map_err(|e| format!("encode frame {f} failed: {e}"))?;
    }

    encoder
        .finish()
        .map_err(|e| format!("encoder finish failed: {e}"))?;

    Ok(ExportSummary {
        out_path: req.out_path.clone(),
        width: render_size.width,
        height: render_size.height,
        fps: plan.fps,
        frame_count: plan.total_frames,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn quality_maps_to_both_resolution_selectors() {
        assert_eq!(
            ExportQuality::P720.render_resolution(),
            RenderResolution::R720p
        );
        assert_eq!(
            ExportQuality::P720.encode_resolution(),
            EncodeResolution::P720
        );
        assert_eq!(
            ExportQuality::P1080.render_resolution(),
            RenderResolution::R1080p
        );
        assert_eq!(
            ExportQuality::P1080.encode_resolution(),
            EncodeResolution::P1080
        );
        assert_eq!(
            ExportQuality::P4k.render_resolution(),
            RenderResolution::R4k
        );
        assert_eq!(
            ExportQuality::P4k.encode_resolution(),
            EncodeResolution::P2160
        );
    }

    #[test]
    fn resolve_preset_accepts_h264_mp4() {
        let preset = resolve_preset(
            ExportCodec::H264,
            ExportQuality::P1080,
            Path::new("/out.mp4"),
        )
        .expect("h264 mp4 should resolve");
        assert_eq!(preset.codec, VideoCodec::H264);
        assert_eq!(preset.resolution, EncodeResolution::P1080);
    }

    #[test]
    fn resolve_preset_rejects_wrong_extension_for_h264() {
        let err = resolve_preset(
            ExportCodec::H264,
            ExportQuality::P1080,
            Path::new("/out.mov"),
        )
        .unwrap_err();
        assert!(err.contains(".mp4"), "got: {err}");
    }

    #[test]
    fn resolve_preset_rejects_unwired_codecs() {
        assert!(resolve_preset(
            ExportCodec::H265,
            ExportQuality::P1080,
            Path::new("/out.mp4")
        )
        .unwrap_err()
        .contains("H.265"));
        assert!(resolve_preset(
            ExportCodec::Prores,
            ExportQuality::P1080,
            Path::new("/out.mov")
        )
        .unwrap_err()
        .contains("ProRes"));
    }

    #[test]
    fn export_request_defaults_to_h264_1080p() {
        // A bare payload (only outPath) relies on #[serde(default)] for the knobs.
        let req: ExportRequest =
            serde_json::from_str(r#"{ "outPath": "/tmp/x.mp4" }"#).expect("parse");
        assert_eq!(req.codec, ExportCodec::H264);
        assert_eq!(req.quality, ExportQuality::P1080);
        assert_eq!(req.out_path, "/tmp/x.mp4");
    }

    #[test]
    fn export_quality_parses_named_variants() {
        let req: ExportRequest = serde_json::from_str(
            r#"{ "outPath": "/tmp/x.mp4", "codec": "h264", "quality": "720p" }"#,
        )
        .expect("parse");
        assert_eq!(req.quality, ExportQuality::P720);
    }
}
