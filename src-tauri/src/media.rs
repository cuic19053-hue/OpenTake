//! Media import command surface.
//!
//! These are the commands the media panel calls to bring local files into the
//! project. They sit on top of two managed-state handles:
//!
//! - [`opentake_core::AppCore`] — the authoritative session; importing appends a
//!   [`MediaManifestEntry`](opentake_domain::MediaManifestEntry) to its manifest
//!   and emits `MediaChanged` (forwarded to the WebView by
//!   [`crate::forward_event`]).
//! - [`MediaState`] — a thin wrapper over an [`opentake_media::MediaEngine`],
//!   used here only to **probe** each file (duration / dimensions / fps / audio).
//!
//! The split mirrors upstream `addMediaAsset(from:)` → `finalizeImportedAsset`:
//! the manifest entry is created from the file path immediately (an *external*
//! reference — the file is not copied into the bundle), then the probe fills in
//! the metadata. Probing is best-effort: if ffprobe is unavailable or the file
//! is unreadable, the asset still imports with zero/empty metadata rather than
//! failing the whole batch (a missing/offline file is a recoverable state the
//! editor already models).
//!
//! Thumbnails are intentionally left as a placeholder (`thumbnail: None`) in
//! this phase: the panel renders from `id` / `name` / `type` / `duration` and
//! the resolvable `path`; persisting + serving thumbnail images to the WebView
//! is a separate concern wired in a later phase.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use opentake_core::{importable_clip_type, AppCore, ProbedMedia};
use opentake_domain::{ClipType, MediaManifestEntry, MediaSource};
use opentake_media::MediaEngine;

/// Managed-state wrapper over the media engine. The engine is read-only here
/// (probe only) and shared across commands; `Send + Sync` so it lives in Tauri
/// state.
pub struct MediaState {
    engine: MediaEngine,
}

impl MediaState {
    /// Wrap an engine for managed state.
    pub fn new(engine: MediaEngine) -> Self {
        MediaState { engine }
    }

    /// The wrapped engine.
    pub fn engine(&self) -> &MediaEngine {
        &self.engine
    }
}

/// One media item for the panel. camelCase to match the existing DTO surface
/// (`core-SPEC.md` §6). `duration` is in seconds; `thumbnail` is the on-disk
/// thumbnail path when one exists (always `None` in this phase — the panel falls
/// back to a type placeholder). `path` is the resolvable absolute source path.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaItemDto {
    /// Asset id (the clip layer's `media_ref`).
    pub id: String,
    /// Display name (file stem unless renamed).
    pub name: String,
    /// Media kind: `"video" | "audio" | "image" | ...` (lowercase, per `ClipType`).
    #[serde(rename = "type")]
    pub kind: ClipType,
    /// Duration in seconds (0 for stills).
    pub duration: f64,
    /// Source width in pixels, when known.
    pub width: Option<i32>,
    /// Source height in pixels, when known.
    pub height: Option<i32>,
    /// Whether the asset carries audio.
    pub has_audio: bool,
    /// Absolute path to the source file, when resolvable (external assets only
    /// in this phase, which is all importing produces).
    pub path: Option<String>,
    /// On-disk thumbnail path, or `None` to render a type placeholder.
    pub thumbnail: Option<String>,
}

impl MediaItemDto {
    /// Project a manifest entry onto the panel DTO.
    fn from_entry(entry: &MediaManifestEntry) -> Self {
        let path = match &entry.source {
            MediaSource::External { absolute_path } => Some(absolute_path.clone()),
            // Project-relative assets need the bundle base to resolve; not
            // produced by importing (always external) but handled for safety.
            MediaSource::Project { .. } => None,
        };
        MediaItemDto {
            id: entry.id.clone(),
            name: entry.name.clone(),
            kind: entry.kind,
            duration: entry.duration,
            width: entry.source_width,
            height: entry.source_height,
            has_audio: entry.has_audio.unwrap_or(false),
            path,
            thumbnail: None,
        }
    }
}

/// The media panel's catalog: every manifest entry as a [`MediaItemDto`].
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaListDto {
    /// All media items, in manifest order.
    pub items: Vec<MediaItemDto>,
}

impl MediaListDto {
    /// Build the list from the core's current manifest snapshot.
    fn from_core(core: &AppCore) -> Self {
        let manifest = core.media();
        MediaListDto {
            items: manifest
                .entries
                .iter()
                .map(MediaItemDto::from_entry)
                .collect(),
        }
    }
}

/// Probe `path` via the engine, mapping ffprobe facts to [`ProbedMedia`]. Probe
/// failures (no ffprobe, unreadable file) degrade to defaults so a single bad
/// file never sinks a batch import.
fn probe_media(engine: &MediaEngine, path: &Path) -> ProbedMedia {
    match engine.probe(path) {
        Ok(p) => ProbedMedia {
            duration_secs: p.duration_secs,
            width: p.width.map(|w| w as i32),
            height: p.height.map(|h| h as i32),
            fps: p.fps,
            has_audio: p.has_audio,
        },
        Err(_) => ProbedMedia::default(),
    }
}

/// Display name for an imported file: its stem, or the full file name when there
/// is no stem (mirrors upstream `url.deletingPathExtension().lastPathComponent`).
fn display_name(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Import one file into the core, probing it first. Returns the created entry, or
/// `None` when the extension is not importable (the file is skipped, not an
/// error — matches upstream's per-file tolerance during folder/batch import).
fn import_one(core: &AppCore, engine: &MediaEngine, path: &Path) -> Option<MediaManifestEntry> {
    importable_clip_type(path)?;
    let probe = probe_media(engine, path);
    // `import_media_file` re-validates the extension; the type check above only
    // lets us skip probing unsupported files.
    core.import_media_file(path, display_name(path), &probe)
        .ok()
}

/// `import_folder`: scan `path` for white-listed media files and import each,
/// returning the updated catalog.
///
/// Top-level scan by default; set `recursive = true` to walk subdirectories
/// (upstream mirrors the tree into media folders — here we flatten into the one
/// manifest, since folder mirroring is a separate `CreateFolder` concern).
/// Entries are visited in case-insensitive name order for deterministic ids.
#[tauri::command]
pub fn import_folder(
    core: State<'_, AppCore>,
    media: State<'_, MediaState>,
    path: String,
    recursive: Option<bool>,
) -> Result<MediaListDto, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let recursive = recursive.unwrap_or(false);
    let engine = media.engine();

    let files = collect_media_files(&root, recursive);
    for file in &files {
        let _ = import_one(&core, engine, file);
    }
    Ok(MediaListDto::from_core(&core))
}

/// `import_media`: import an explicit list of file paths, returning the updated
/// catalog. Unsupported or unreadable paths are skipped (not fatal); the
/// returned list reflects whatever imported successfully.
#[tauri::command]
pub fn import_media(
    core: State<'_, AppCore>,
    media: State<'_, MediaState>,
    paths: Vec<String>,
) -> Result<MediaListDto, String> {
    let engine = media.engine();
    for p in &paths {
        let path = PathBuf::from(p);
        if path.is_file() {
            let _ = import_one(&core, engine, &path);
        }
    }
    Ok(MediaListDto::from_core(&core))
}

/// `get_media`: the current media catalog for the panel. Infallible.
#[tauri::command]
pub fn get_media(core: State<'_, AppCore>) -> MediaListDto {
    MediaListDto::from_core(&core)
}

/// Collect importable media files under `root`. Top-level only unless
/// `recursive`. Sorted by case-insensitive file name so a folder import mints
/// asset ids in a stable order. Hidden entries (dot-prefixed) are skipped, as
/// upstream does (`.skipsHiddenFiles`).
fn collect_media_files(root: &Path, recursive: bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    collect_into(root, recursive, &mut out);
    out.sort_by(|a, b| {
        let an = a.file_name().map(|s| s.to_string_lossy().to_lowercase());
        let bn = b.file_name().map(|s| s.to_string_lossy().to_lowercase());
        an.cmp(&bn)
    });
    out
}

fn collect_into(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_hidden = path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.starts_with('.'))
            .unwrap_or(false);
        if is_hidden {
            continue;
        }
        if path.is_dir() {
            if recursive {
                collect_into(&path, recursive, out);
            }
        } else if importable_clip_type(&path).is_some() {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn engine_for(tmp: &Path) -> MediaEngine {
        MediaEngine::new(tmp.join("cache"), tmp.join("models"))
    }

    fn touch(path: &Path) {
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn dto_projects_external_entry_with_path() {
        let entry = MediaManifestEntry {
            id: "a".into(),
            name: "clip".into(),
            kind: ClipType::Video,
            source: MediaSource::External {
                absolute_path: "/abs/clip.mp4".into(),
            },
            duration: 3.0,
            generation_input: None,
            source_width: Some(640),
            source_height: Some(480),
            source_fps: Some(24.0),
            has_audio: Some(true),
            folder_id: None,
            cached_remote_url: None,
            cached_remote_url_expires_at: None,
        };
        let dto = MediaItemDto::from_entry(&entry);
        assert_eq!(dto.id, "a");
        assert_eq!(dto.kind, ClipType::Video);
        assert_eq!(dto.duration, 3.0);
        assert_eq!(dto.width, Some(640));
        assert!(dto.has_audio);
        assert_eq!(dto.path.as_deref(), Some("/abs/clip.mp4"));
        assert_eq!(dto.thumbnail, None);
    }

    #[test]
    fn media_item_dto_serializes_camel_case() {
        let dto = MediaItemDto {
            id: "a".into(),
            name: "n".into(),
            kind: ClipType::Image,
            duration: 0.0,
            width: Some(10),
            height: Some(20),
            has_audio: false,
            path: Some("/p.png".into()),
            thumbnail: None,
        };
        let json = serde_json::to_string(&dto).unwrap();
        assert!(json.contains("\"hasAudio\""));
        assert!(json.contains("\"type\":\"image\""));
        assert!(json.contains("\"thumbnail\":null"));
    }

    #[test]
    fn display_name_uses_stem() {
        assert_eq!(display_name(Path::new("/a/b/My Clip.mp4")), "My Clip");
        assert_eq!(display_name(Path::new("/a/b/noext")), "noext");
    }

    #[test]
    fn collect_top_level_only_skips_subdirs_and_hidden_and_unsupported() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        touch(&root.join("a.mp4"));
        touch(&root.join("b.png"));
        touch(&root.join("c.txt")); // unsupported
        touch(&root.join(".hidden.mp4")); // hidden
        fs::create_dir(root.join("sub")).unwrap();
        touch(&root.join("sub").join("d.mov"));

        let files = collect_media_files(root, false);
        let names: Vec<String> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.mp4", "b.png"]);
    }

    #[test]
    fn collect_recursive_includes_subdirs_sorted() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        touch(&root.join("z.mp4"));
        fs::create_dir(root.join("sub")).unwrap();
        touch(&root.join("sub").join("a.mov"));

        let files = collect_media_files(root, true);
        let names: Vec<String> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        // Sorted case-insensitively by file name: a.mov before z.mp4.
        assert_eq!(names, vec!["a.mov", "z.mp4"]);
    }

    #[test]
    fn import_media_imports_supported_and_skips_others() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let good = root.join("clip.mp4");
        let bad = root.join("doc.txt");
        touch(&good);
        touch(&bad);

        let core = AppCore::new();
        let media = MediaState::new(engine_for(root));

        // Drive the import logic directly (the #[tauri::command] wrapper only
        // adds State extraction). Probing a non-media file yields defaults.
        for p in [&good, &bad] {
            if p.is_file() {
                let _ = import_one(&core, media.engine(), p);
            }
        }

        let list = MediaListDto::from_core(&core);
        assert_eq!(list.items.len(), 1);
        assert_eq!(list.items[0].kind, ClipType::Video);
        assert_eq!(list.items[0].name, "clip");
        assert_eq!(list.items[0].path.as_deref(), Some(good.to_str().unwrap()));
    }

    #[test]
    fn get_media_reflects_imported_items() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let core = AppCore::new();
        let engine = engine_for(root);
        let f = root.join("a.png");
        touch(&f);
        import_one(&core, &engine, &f);

        let list = MediaListDto::from_core(&core);
        assert_eq!(list.items.len(), 1);
        assert_eq!(list.items[0].kind, ClipType::Image);
    }
}
