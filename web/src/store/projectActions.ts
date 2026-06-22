/**
 * Project lifecycle gestures driven from the Home view. "New" starts a fresh
 * session and enters the editor; "Open" picks an `.opentake` bundle (a directory
 * on disk) via the native dialog, opens it in the core, records it in recents,
 * and enters the editor. All paths degrade gracefully outside Tauri so the
 * browser shell can still navigate into the editor.
 */

import * as api from "../lib/api";
import { isTauri } from "../lib/api";
import { forceRefresh } from "./sync";
import { useEditorUiStore } from "./uiStore";
import { useProjectStore } from "./projectStore";
import { useRecentStore } from "./recentStore";
import { openDialog } from "../lib/dialog";

/** New, unsaved project, then enter the editor. */
export async function newProjectAndEnter(): Promise<void> {
  await api.projectNew();
  if (!isTauri) await forceRefresh();
  useEditorUiStore.getState().setView("editor");
}

/** Open `path` (a `.opentake` bundle), refresh the mirror, record it, and enter
 *  the editor. Used by both the dialog flow and the recents list. */
export async function openProjectPath(path: string): Promise<void> {
  const snap = await api.projectOpen(path);
  useProjectStore.getState().setMirror(snap.timeline, snap.version);
  useProjectStore.getState().setProjectPath(path);
  useRecentStore.getState().add(path);
  useEditorUiStore.getState().setView("editor");
}

/** Pick a project bundle with the native dialog, then open it. `.opentake`
 *  bundles are directories, so the picker is a directory chooser (mirrors
 *  upstream's package-as-folder open panel). */
export async function openProjectViaDialog(): Promise<void> {
  const open = await openDialog();
  if (!open) {
    // Browser shell: no file system. Just enter the editor on the demo mirror.
    useEditorUiStore.getState().setView("editor");
    return;
  }
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected !== "string") return; // cancelled
  await openProjectPath(selected);
}
