/**
 * Native dialog access (tauri-plugin-dialog), code-split so it never lands in the
 * browser-fallback bundle. `openDialog()` resolves the typed `open` function when
 * running under Tauri, else `null` so callers can degrade to a no-op. The
 * `defaultPath` field accepts `undefined` (the plugin's option type does not
 * allow `null`).
 */

import type { open as TauriOpen } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./api";

/** The typed `open` from the dialog plugin, or null outside Tauri. */
export async function openDialog(): Promise<typeof TauriOpen | null> {
  if (!isTauri) return null;
  const mod = await import("@tauri-apps/plugin-dialog");
  return mod.open;
}
