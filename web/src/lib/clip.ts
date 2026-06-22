/**
 * Clip-derived UI helpers (pure). Track color, display name, link flag.
 * See SPEC §5.4 (label = name + double-space + duration, underline when linked)
 * and §1.5 (track colors by ClipType).
 */

import { TRACK_COLOR } from "./theme";
import { formatClipDuration } from "./geometry";
import type { Clip, ClipType } from "./types";

export function trackColor(type: ClipType): string {
  return TRACK_COLOR[type] ?? TRACK_COLOR.video;
}

/** First non-empty line of textContent, else a friendly fallback from mediaRef. */
export function clipDisplayName(clip: Clip): string {
  if (clip.textContent) {
    const firstLine = clip.textContent.split("\n").find((l) => l.trim().length > 0);
    if (firstLine) return firstLine.trim();
  }
  if (clip.mediaRef) return clip.mediaRef;
  return clip.mediaType;
}

/** Clip label-bar text: "<name>  <duration timecode>" (ClipRenderer:598-609). */
export function clipLabel(clip: Clip, fps: number): string {
  return `${clipDisplayName(clip)}  ${formatClipDuration(clip.durationFrames, fps)}`;
}

export function isLinked(clip: Clip): boolean {
  return clip.linkGroupId != null;
}
