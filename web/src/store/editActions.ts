/**
 * Gesture -> EditCommand mapping (SPEC §11.1). Every editing action funnels
 * through `editApply`; after a successful change we force a mirror refresh so
 * the browser fallback (which emits no event) and Tauri behave identically.
 */

import * as api from "../lib/api";
import { isTauri } from "../lib/api";
import { forceRefresh } from "./sync";
import { useEditorUiStore } from "./uiStore";
import type {
  ClipMoveReq,
  ClipPropertiesReq,
  TrimEditReq,
} from "../lib/types";

async function applyAndRefresh(cmd: Parameters<typeof api.editApply>[0]) {
  const res = await api.editApply(cmd);
  // Tauri pushes timeline_changed -> sync re-fetches. The browser fallback has
  // no event channel, so refresh explicitly there.
  if (!isTauri && res.changed) await forceRefresh();
  return res;
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
