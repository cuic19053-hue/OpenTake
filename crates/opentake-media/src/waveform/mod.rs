//! Waveform generation: pure-Rust audio decode (Symphonia) → mono f32 → RMS
//! downsample → normalized `0=loud, 1=silence` buckets, with an optional
//! `.waveform` disk cache.
//!
//! Replaces upstream's `DSWaveformImage` dependency (`MediaVisualCache.swift`).
//! The count formula and normalization are byte-for-byte intent-compatible; the
//! exact bucket *values* are visually equivalent but not bit-identical to the
//! third-party analyzer (SPEC §4.3 — waveform is a UI affordance, not a
//! frame-level edit quantity).

mod dsp;
pub mod store;

pub use dsp::{
    rms_downsample_normalized, waveform_sample_count, BUCKETS_PER_SECOND, MAX_BUCKETS, MIN_BUCKETS,
};

use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::cache_key::{file_identity_key, KEY_HEX_LEN};
use crate::error::{MediaError, Result};

/// Decode `path`'s first audio track to mono f32 (multi-channel is averaged).
/// Returns the full decoded signal. Errors if there is no audio track.
pub fn decode_pcm_mono(path: &Path) -> Result<Vec<f32>> {
    let file = File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| MediaError::Decode(format!("probe: {e}")))?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.channels.is_some() || t.codec_params.sample_rate.is_some())
        .or_else(|| format.tracks().first())
        .ok_or_else(|| MediaError::no_track("audio", path))?;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| MediaError::Decode(format!("make decoder: {e}")))?;

    let mut out: Vec<f32> = Vec::new();
    let mut sample_buf: Option<SampleBuffer<f32>> = None;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(e) => return Err(MediaError::Decode(format!("next_packet: {e}"))),
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let channels = spec.channels.count().max(1);
                if sample_buf.is_none() {
                    sample_buf = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
                }
                let buf = sample_buf.as_mut().unwrap();
                buf.copy_interleaved_ref(decoded);
                // Down-mix interleaved channels to mono by averaging.
                for frame in buf.samples().chunks(channels) {
                    let sum: f32 = frame.iter().copied().sum();
                    out.push(sum / channels as f32);
                }
            }
            Err(SymError::DecodeError(_)) => continue, // skip a bad packet
            Err(e) => return Err(MediaError::Decode(format!("decode: {e}"))),
        }
    }

    Ok(out)
}

/// Generate normalized waveform buckets for `path` (no caching).
/// Bucket count follows [`waveform_sample_count`].
pub fn waveform(path: &Path, duration_secs: f64) -> Result<Vec<f32>> {
    let pcm = decode_pcm_mono(path)?;
    let count = waveform_sample_count(duration_secs);
    Ok(rms_downsample_normalized(&pcm, count))
}

/// Like [`waveform`] but reads/writes the `.waveform` disk cache under
/// `<cache_root>/MediaVisualCache/<key>.waveform`.
pub fn waveform_cached(cache_root: &Path, path: &Path, duration_secs: f64) -> Result<Vec<f32>> {
    if let Some(key) = file_identity_key(path, KEY_HEX_LEN) {
        if let Some(cached) = store::load_waveform(cache_root, &key) {
            return Ok(cached);
        }
        let samples = waveform(path, duration_secs)?;
        let _ = store::save_waveform(cache_root, &key, &samples);
        return Ok(samples);
    }
    waveform(path, duration_secs)
}
