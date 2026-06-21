//! `get_timeline` LLM-friendly compact encoding (`agent-SPEC.md` §8.3, 1:1 with
//! upstream `ToolExecutor+Timeline.swift`). This is the agent layer's job (a
//! token-frugal *representation*), not `opentake-core`'s — same layer as
//! short-id shortening.
//!
//! Compaction rules:
//! - Strip fields equal to defaults: track `{muted:false, hidden:false,
//!   syncLocked:true}`; clip `{mediaType:"video", speed:1, volume:1,
//!   opacity:1, trims/fades 0, identity transform/crop, default textStyle}`;
//!   `sourceClipType == mediaType` is dropped. Text clips never report trims.
//! - Caption clips (shared `captionGroupId`) fold into `captionGroups`: common
//!   style hoisted into `shared`, each clip a `[clipId, startFrame,
//!   durationFrames, text]` row, capped at 200 rows/group.
//! - Floats rounded to 3 places.
//! - Window paging: `startFrame`/`endFrame` keep only intersecting clips;
//!   hidden clips reported via `totalClips`/`totalFrames`.
//! - Tracks report a display label (V1/A1/...), not the storage id.

use std::collections::BTreeMap;

use opentake_domain::{Clip, ClipType, Timeline, Track};
use serde_json::{json, Map, Value};

const CAPTION_ROW_LIMIT: usize = 200;

/// Round to 3 decimal places (half away from zero), matching upstream
/// `roundJSONFloatingPointNumbers(toPlaces: 3)`.
fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

/// Display label for a track ("V1", "A1", "I1", ...). Counts tracks of the same
/// kind up to (and including) `index`, mirroring the visible numbering.
fn track_label(timeline: &Timeline, index: usize) -> String {
    let kind = timeline.tracks[index].kind;
    let prefix = match kind {
        ClipType::Video => "V",
        ClipType::Audio => "A",
        ClipType::Image => "I",
        ClipType::Text => "T",
        ClipType::Lottie => "L",
    };
    let n = timeline.tracks[..=index]
        .iter()
        .filter(|t| t.kind == kind)
        .count();
    format!("{prefix}{n}")
}

fn clip_type_str(t: ClipType) -> &'static str {
    match t {
        ClipType::Video => "video",
        ClipType::Audio => "audio",
        ClipType::Image => "image",
        ClipType::Text => "text",
        ClipType::Lottie => "lottie",
    }
}

/// Whether a clip intersects the half-open window `[start, end)`. `None` bound =
/// open on that side.
fn intersects(clip: &Clip, start: Option<i32>, end: Option<i32>) -> bool {
    let cs = clip.start_frame;
    let ce = clip.end_frame();
    if let Some(s) = start {
        if ce <= s {
            return false;
        }
    }
    if let Some(e) = end {
        if cs >= e {
            return false;
        }
    }
    true
}

/// Encode one non-caption clip, omitting default-valued fields.
fn encode_clip(clip: &Clip) -> Value {
    let mut m = Map::new();
    m.insert("clipId".into(), json!(clip.id));
    m.insert("startFrame".into(), json!(clip.start_frame));
    m.insert("durationFrames".into(), json!(clip.duration_frames));

    if clip.media_type != ClipType::Video {
        m.insert("mediaType".into(), json!(clip_type_str(clip.media_type)));
    }
    if clip.source_clip_type != clip.media_type {
        m.insert(
            "sourceClipType".into(),
            json!(clip_type_str(clip.source_clip_type)),
        );
    }
    if clip.media_type != ClipType::Text {
        if !clip.media_ref.is_empty() {
            m.insert("mediaRef".into(), json!(clip.media_ref));
        }
        // Text clips never report trims (no source media).
        if clip.trim_start_frame != 0 {
            m.insert("trimStartFrame".into(), json!(clip.trim_start_frame));
        }
        if clip.trim_end_frame != 0 {
            m.insert("trimEndFrame".into(), json!(clip.trim_end_frame));
        }
    }
    if (clip.speed - 1.0).abs() > f64::EPSILON {
        m.insert("speed".into(), json!(round3(clip.speed)));
    }
    if (clip.volume - 1.0).abs() > f64::EPSILON {
        m.insert("volume".into(), json!(round3(clip.volume)));
    }
    if (clip.opacity - 1.0).abs() > f64::EPSILON {
        m.insert("opacity".into(), json!(round3(clip.opacity)));
    }
    if clip.fade_in_frames != 0 {
        m.insert("fadeInFrames".into(), json!(clip.fade_in_frames));
    }
    if clip.fade_out_frames != 0 {
        m.insert("fadeOutFrames".into(), json!(clip.fade_out_frames));
    }
    let tf = &clip.transform;
    let identity = tf.center_x == 0.5
        && tf.center_y == 0.5
        && tf.width == 1.0
        && tf.height == 1.0
        && tf.rotation == 0.0
        && !tf.flip_horizontal
        && !tf.flip_vertical;
    if !identity {
        m.insert(
            "transform".into(),
            json!({
                "centerX": round3(tf.center_x),
                "centerY": round3(tf.center_y),
                "width": round3(tf.width),
                "height": round3(tf.height),
                "rotation": round3(tf.rotation),
                "flipHorizontal": tf.flip_horizontal,
                "flipVertical": tf.flip_vertical,
            }),
        );
    }
    if !clip.crop.is_identity() {
        m.insert(
            "crop".into(),
            json!({
                "left": round3(clip.crop.left),
                "top": round3(clip.crop.top),
                "right": round3(clip.crop.right),
                "bottom": round3(clip.crop.bottom),
            }),
        );
    }
    if let Some(content) = &clip.text_content {
        m.insert("content".into(), json!(content));
    }
    if let Some(g) = &clip.link_group_id {
        m.insert("linkGroupId".into(), json!(g));
    }
    // Keyframe presence flags (compact — full curves are large).
    let mut kf: Vec<&str> = Vec::new();
    if clip.opacity_track.is_some() {
        kf.push("opacity");
    }
    if clip.position_track.is_some() {
        kf.push("position");
    }
    if clip.scale_track.is_some() {
        kf.push("scale");
    }
    if clip.rotation_track.is_some() {
        kf.push("rotation");
    }
    if clip.crop_track.is_some() {
        kf.push("crop");
    }
    if clip.volume_track.is_some() {
        kf.push("volume");
    }
    if !kf.is_empty() {
        m.insert("keyframed".into(), json!(kf));
    }
    Value::Object(m)
}

/// Encode one track, folding caption clips into `captionGroups`.
fn encode_track(timeline: &Timeline, index: usize, start: Option<i32>, end: Option<i32>) -> Value {
    let track: &Track = &timeline.tracks[index];
    let mut m = Map::new();
    m.insert("trackIndex".into(), json!(index));
    m.insert("track".into(), json!(track_label(timeline, index)));
    m.insert("type".into(), json!(clip_type_str(track.kind)));
    if track.muted {
        m.insert("muted".into(), json!(true));
    }
    if track.hidden {
        m.insert("hidden".into(), json!(true));
    }
    if !track.sync_locked {
        m.insert("syncLocked".into(), json!(false));
    }

    let total_clips = track.clips.len();
    let visible: Vec<&Clip> = track
        .clips
        .iter()
        .filter(|c| intersects(c, start, end))
        .collect();

    // Group caption clips by captionGroupId.
    let mut caption_groups: BTreeMap<String, Vec<&Clip>> = BTreeMap::new();
    let mut plain: Vec<&Clip> = Vec::new();
    for c in &visible {
        if let Some(g) = &c.caption_group_id {
            caption_groups.entry(g.clone()).or_default().push(c);
        } else {
            plain.push(c);
        }
    }

    if !plain.is_empty() {
        let clips: Vec<Value> = plain.iter().map(|c| encode_clip(c)).collect();
        m.insert("clips".into(), Value::Array(clips));
    }

    if !caption_groups.is_empty() {
        let groups: Vec<Value> = caption_groups
            .iter()
            .map(|(gid, clips)| encode_caption_group(gid, clips))
            .collect();
        m.insert("captionGroups".into(), Value::Array(groups));
    }

    // Report hidden counts when the window trimmed the track.
    if visible.len() < total_clips {
        m.insert("totalClips".into(), json!(total_clips));
        m.insert("totalFrames".into(), json!(track.end_frame()));
    }
    Value::Object(m)
}

/// Fold a caption group: hoist shared style, emit `[clipId, startFrame,
/// durationFrames, text]` rows capped at `CAPTION_ROW_LIMIT`.
fn encode_caption_group(group_id: &str, clips: &[&Clip]) -> Value {
    let mut shared = Map::new();
    // Hoist common font/color/center from the first clip's text style.
    if let Some(first) = clips.first() {
        if let Some(style) = &first.text_style {
            shared.insert("fontName".into(), json!(style.font_name));
            shared.insert("fontSize".into(), json!(round3(style.font_size)));
            shared.insert(
                "color".into(),
                json!({
                    "r": round3(style.color.r),
                    "g": round3(style.color.g),
                    "b": round3(style.color.b),
                    "a": round3(style.color.a),
                }),
            );
        }
        let tf = &first.transform;
        shared.insert("centerX".into(), json!(round3(tf.center_x)));
        shared.insert("centerY".into(), json!(round3(tf.center_y)));
    }

    let shown = clips.len().min(CAPTION_ROW_LIMIT);
    let rows: Vec<Value> = clips
        .iter()
        .take(shown)
        .map(|c| {
            json!([
                c.id,
                c.start_frame,
                c.duration_frames,
                c.text_content.clone().unwrap_or_default()
            ])
        })
        .collect();

    let mut m = Map::new();
    m.insert("captionGroupId".into(), json!(group_id));
    m.insert("rowFormat".into(), json!("[clipId, startFrame, durationFrames, text]"));
    m.insert("shared".into(), Value::Object(shared));
    m.insert("rows".into(), Value::Array(rows));
    m.insert("clipCount".into(), json!(clips.len()));
    Value::Object(m)
}

/// Encode the whole timeline into the compact JSON `get_timeline` returns.
/// `can_generate` comes from the core (gating generation tools). `start`/`end`
/// page the window.
pub fn encode_timeline(
    timeline: &Timeline,
    start: Option<i32>,
    end: Option<i32>,
    can_generate: bool,
) -> Value {
    let tracks: Vec<Value> = (0..timeline.tracks.len())
        .map(|i| encode_track(timeline, i, start, end))
        .collect();
    json!({
        "fps": timeline.fps,
        "width": timeline.width,
        "height": timeline.height,
        "totalFrames": timeline.total_frames(),
        "canGenerate": can_generate,
        "tracks": tracks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentake_domain::{Clip, ClipType, TextStyle, Track};

    fn video_clip(id: &str, start: i32, dur: i32) -> Clip {
        Clip::new(id, "asset-1", start, dur)
    }

    #[test]
    fn defaults_are_stripped() {
        let mut tl = Timeline::new();
        let mut t = Track::new("t1", ClipType::Video);
        t.clips.push(video_clip("c1", 0, 30));
        tl.tracks.push(t);
        let v = encode_timeline(&tl, None, None, true);
        let clip = &v["tracks"][0]["clips"][0];
        // Default speed/volume/opacity/transform omitted.
        assert!(clip.get("speed").is_none());
        assert!(clip.get("volume").is_none());
        assert!(clip.get("transform").is_none());
        // mediaType video is the default -> omitted.
        assert!(clip.get("mediaType").is_none());
        assert_eq!(clip["clipId"], json!("c1"));
        assert_eq!(clip["mediaRef"], json!("asset-1"));
    }

    #[test]
    fn non_default_fields_kept_and_rounded() {
        let mut tl = Timeline::new();
        let mut t = Track::new("t1", ClipType::Video);
        let mut c = video_clip("c1", 0, 30);
        c.speed = 1.23456;
        c.volume = 0.5;
        t.clips.push(c);
        tl.tracks.push(t);
        let v = encode_timeline(&tl, None, None, false);
        let clip = &v["tracks"][0]["clips"][0];
        assert_eq!(clip["speed"], json!(1.235)); // rounded to 3 places
        assert_eq!(clip["volume"], json!(0.5));
        assert_eq!(v["canGenerate"], json!(false));
    }

    #[test]
    fn track_label_numbers_per_kind() {
        let mut tl = Timeline::new();
        tl.tracks.push(Track::new("v1", ClipType::Video));
        tl.tracks.push(Track::new("v2", ClipType::Video));
        tl.tracks.push(Track::new("a1", ClipType::Audio));
        let v = encode_timeline(&tl, None, None, true);
        assert_eq!(v["tracks"][0]["track"], json!("V1"));
        assert_eq!(v["tracks"][1]["track"], json!("V2"));
        assert_eq!(v["tracks"][2]["track"], json!("A1"));
    }

    #[test]
    fn window_paging_hides_outside_clips_and_reports_totals() {
        let mut tl = Timeline::new();
        let mut t = Track::new("t1", ClipType::Video);
        t.clips.push(video_clip("a", 0, 30)); // [0,30)
        t.clips.push(video_clip("b", 100, 30)); // [100,130)
        tl.tracks.push(t);
        // Window [0,50) keeps only "a".
        let v = encode_timeline(&tl, Some(0), Some(50), true);
        let track = &v["tracks"][0];
        assert_eq!(track["clips"].as_array().unwrap().len(), 1);
        assert_eq!(track["clips"][0]["clipId"], json!("a"));
        assert_eq!(track["totalClips"], json!(2));
        assert_eq!(track["totalFrames"], json!(130));
    }

    #[test]
    fn caption_clips_fold_into_groups() {
        let mut tl = Timeline::new();
        let mut t = Track::new("t1", ClipType::Video);
        for (i, txt) in ["Hello", "World"].iter().enumerate() {
            let mut c = Clip::new(format!("cap{i}"), "", i as i32 * 30, 30);
            c.media_type = ClipType::Text;
            c.source_clip_type = ClipType::Text;
            c.caption_group_id = Some("grp-1".into());
            c.text_content = Some(txt.to_string());
            c.text_style = Some(TextStyle::default());
            t.clips.push(c);
        }
        tl.tracks.push(t);
        let v = encode_timeline(&tl, None, None, true);
        let groups = &v["tracks"][0]["captionGroups"];
        assert_eq!(groups.as_array().unwrap().len(), 1);
        let g = &groups[0];
        assert_eq!(g["captionGroupId"], json!("grp-1"));
        assert_eq!(g["clipCount"], json!(2));
        assert_eq!(g["rows"][0][3], json!("Hello"));
        assert_eq!(g["rows"][1][3], json!("World"));
        // Shared style hoisted.
        assert_eq!(g["shared"]["fontName"], json!("Helvetica-Bold"));
        // Plain clips array absent when only captions present.
        assert!(v["tracks"][0].get("clips").is_none());
    }

    #[test]
    fn caption_rows_capped_at_200() {
        let mut tl = Timeline::new();
        let mut t = Track::new("t1", ClipType::Video);
        for i in 0..250 {
            let mut c = Clip::new(format!("cap{i}"), "", i * 10, 10);
            c.media_type = ClipType::Text;
            c.caption_group_id = Some("grp".into());
            c.text_content = Some(format!("w{i}"));
            t.clips.push(c);
        }
        tl.tracks.push(t);
        let v = encode_timeline(&tl, None, None, true);
        let g = &v["tracks"][0]["captionGroups"][0];
        assert_eq!(g["rows"].as_array().unwrap().len(), 200); // capped
        assert_eq!(g["clipCount"], json!(250)); // true count reported
    }

    #[test]
    fn text_clip_omits_trims() {
        let mut tl = Timeline::new();
        let mut t = Track::new("t1", ClipType::Video);
        let mut c = Clip::new("txt", "", 0, 30);
        c.media_type = ClipType::Text;
        c.trim_start_frame = 5; // would normally show, but text clips skip trims
        c.text_content = Some("Title".into());
        t.clips.push(c);
        tl.tracks.push(t);
        let v = encode_timeline(&tl, None, None, true);
        let clip = &v["tracks"][0]["clips"][0];
        assert!(clip.get("trimStartFrame").is_none());
        assert_eq!(clip["content"], json!("Title"));
        assert_eq!(clip["mediaType"], json!("text"));
    }
}
