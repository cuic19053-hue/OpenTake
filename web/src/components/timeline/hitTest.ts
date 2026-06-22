/**
 * Timeline hit-testing (SPEC §5.8). Maps a document-space point to a clip and a
 * sub-region (left trim handle / right trim handle / body), following the
 * upstream priority (handles before body). Coordinates are document-space
 * (already offset for the header column and scroll by the caller).
 */

import { TRIM } from "../../lib/theme";
import { clipRect } from "../../lib/geometry";
import type { Timeline, Clip } from "../../lib/types";

export type ClipRegion = "trimLeft" | "trimRight" | "body";

export interface ClipHit {
  trackIndex: number;
  clipIndex: number;
  clip: Clip;
  region: ClipRegion;
  /** x within the clip rect. */
  localX: number;
}

export function hitTestClip(
  timeline: Timeline,
  docX: number,
  docY: number,
  pixelsPerFrame: number,
  trackHeights: Record<string, number>,
): ClipHit | null {
  for (let ti = 0; ti < timeline.tracks.length; ti++) {
    const track = timeline.tracks[ti];
    for (let ci = 0; ci < track.clips.length; ci++) {
      const clip = track.clips[ci];
      const rect = clipRect(timeline, ti, clip, pixelsPerFrame, trackHeights);
      if (
        docX >= rect.x &&
        docX <= rect.x + rect.width &&
        docY >= rect.y &&
        docY <= rect.y + rect.height
      ) {
        const localX = docX - rect.x;
        let region: ClipRegion = "body";
        if (localX <= TRIM.handleWidth) region = "trimLeft";
        else if (localX >= rect.width - TRIM.handleWidth) region = "trimRight";
        return { trackIndex: ti, clipIndex: ci, clip, region, localX };
      }
    }
  }
  return null;
}

/** Expand a clip id set to its full link groups (SPEC §9.1 linked selection). */
export function expandLinkGroup(timeline: Timeline, ids: Set<string>): Set<string> {
  const groups = new Set<string>();
  for (const t of timeline.tracks) {
    for (const c of t.clips) {
      if (ids.has(c.id) && c.linkGroupId) groups.add(c.linkGroupId);
    }
  }
  if (groups.size === 0) return new Set(ids);
  const out = new Set(ids);
  for (const t of timeline.tracks) {
    for (const c of t.clips) {
      if (c.linkGroupId && groups.has(c.linkGroupId)) out.add(c.id);
    }
  }
  return out;
}

/** All clips intersecting a document-space rectangle (marquee). */
export function clipsInRect(
  timeline: Timeline,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pixelsPerFrame: number,
  trackHeights: Record<string, number>,
): Set<string> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const out = new Set<string>();
  for (let ti = 0; ti < timeline.tracks.length; ti++) {
    for (const clip of timeline.tracks[ti].clips) {
      const rect = clipRect(timeline, ti, clip, pixelsPerFrame, trackHeights);
      const intersects =
        rect.x <= maxX &&
        rect.x + rect.width >= minX &&
        rect.y <= maxY &&
        rect.y + rect.height >= minY;
      if (intersects) out.add(clip.id);
    }
  }
  return out;
}
