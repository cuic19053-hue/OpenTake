/**
 * Gesture -> EditCommand mapping (SPEC §11.1). Every editing action funnels
 * through `editApply`; after a successful change we force a mirror refresh so
 * the browser fallback (which emits no event) and Tauri behave identically.
 */

import * as api from "../lib/api";
import { isTauri } from "../lib/api";
import { forceRefresh } from "./sync";
import { useEditorUiStore } from "./uiStore";
import { useProjectStore } from "./projectStore";
import type {
  ClipEntryReq,
  ClipMoveReq,
  ClipPropertiesReq,
  MediaItem,
  Timeline,
  TrimEditReq,
} from "../lib/types";

async function applyAndRefresh(cmd: Parameters<typeof api.editApply>[0]) {
  const res = await api.editApply(cmd);
  // Tauri pushes timeline_changed -> sync re-fetches. The browser fallback has
  // no event channel, so refresh explicitly there.
  if (!isTauri && res.changed) await forceRefresh();
  return res;
}

export async function addClips(entries: ClipEntryReq[]) {
  if (entries.length === 0) return;
  await applyAndRefresh({ type: "addClips", entries });
}

export async function moveClips(moves: ClipMoveReq[]) {
  if (moves.length === 0) return;
  await applyAndRefresh({ type: "moveClips", moves });
}

export async function removeClips(clipIds: string[]) {
  if (clipIds.length === 0) return;
  await applyAndRefresh({ type: "removeClips", clipIds });
}

export async function splitClip(clipId: string, atFrame: number) {
  await applyAndRefresh({ type: "splitClip", clipId, atFrame });
}

export async function trimClips(edits: TrimEditReq[]) {
  if (edits.length === 0) return;
  await applyAndRefresh({ type: "trimClips", edits });
}

export async function setClipProperties(clipIds: string[], properties: ClipPropertiesReq) {
  if (clipIds.length === 0) return;
  await applyAndRefresh({ type: "setClipProperties", clipIds, properties });
}

export async function linkClips(clipIds: string[]) {
  await applyAndRefresh({ type: "link", clipIds });
}

export async function unlinkClips(clipIds: string[]) {
  await applyAndRefresh({ type: "unlink", clipIds });
}

export async function undo() {
  await api.undo();
  if (!isTauri) await forceRefresh();
}

export async function redo() {
  await api.redo();
  if (!isTauri) await forceRefresh();
}

/** Split at the current playhead for the selected clip (Toolbar / ⌘K). */
export async function splitAtPlayhead() {
  const ui = useEditorUiStore.getState();
  const frame = ui.activeFrame;
  const selected = [...ui.selectedClipIds];
  if (selected.length === 1) {
    await splitClip(selected[0], frame);
  }
}

/** Delete selected clips (⌫ / menu). */
export async function deleteSelectedClips() {
  const ui = useEditorUiStore.getState();
  const ids = [...ui.selectedClipIds];
  if (ids.length > 0) {
    await removeClips(ids);
    ui.clearSelection();
  }
}

// MARK: - Media -> timeline (drag and drop)

/** Stills get a fixed default duration (upstream `Constants.defaultImageDuration`
 *  ≈ 5s) since they have no intrinsic length. */
const DEFAULT_IMAGE_SECONDS = 5;

function isVisual(type: MediaItem["type"]): boolean {
  return type === "video" || type === "image" || type === "text" || type === "lottie";
}

/** First existing track whose kind is compatible with `type`, else null.
 *  `AddClips` can't create tracks (validated against existing ones), so a drop
 *  targets an existing compatible track; an empty timeline silently no-ops until
 *  a track-creation command lands (follow-up). */
function firstCompatibleTrackIndex(timeline: Timeline, type: MediaItem["type"]): number | null {
  const wantAudio = type === "audio";
  for (let i = 0; i < timeline.tracks.length; i++) {
    const trackIsAudio = timeline.tracks[i].type === "audio";
    if (wantAudio ? trackIsAudio : !trackIsAudio && isVisual(timeline.tracks[i].type)) {
      return i;
    }
  }
  return null;
}

/** Append position on a track: just past its last clip (clamped to >= 0). */
function appendStartFrame(timeline: Timeline, trackIndex: number): number {
  return timeline.tracks[trackIndex].clips.reduce(
    (max, c) => Math.max(max, c.startFrame + c.durationFrames),
    0,
  );
}

/** Build the clip entry for a media item dropped on the timeline, or null when
 *  no compatible track exists. */
function entryForMedia(timeline: Timeline, item: MediaItem): ClipEntryReq | null {
  const trackIndex = firstCompatibleTrackIndex(timeline, item.type);
  if (trackIndex === null) return null;
  const seconds = item.duration > 0 ? item.duration : DEFAULT_IMAGE_SECONDS;
  const durationFrames = Math.max(1, Math.round(seconds * timeline.fps));
  return {
    mediaRef: item.id,
    mediaType: item.type,
    sourceClipType: item.type,
    trackIndex,
    startFrame: appendStartFrame(timeline, trackIndex),
    durationFrames,
    hasAudio: item.hasAudio,
    addLinkedAudio: item.type === "video" && item.hasAudio,
  };
}

/** Add a media-library item to the timeline (drag-drop from the media panel).
 *  Resolves the target track and append position from the current mirror, then
 *  funnels through `addClips`. */
export async function addMediaToTimeline(item: MediaItem) {
  const timeline = useProjectStore.getState().timeline;
  const entry = entryForMedia(timeline, item);
  if (!entry) return;
  await addClips([entry]);
}
