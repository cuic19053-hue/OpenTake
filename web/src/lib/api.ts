/**
 * Tauri bridge. All editing goes through `edit_apply`; the mirror is fetched via
 * `get_timeline` and refreshed on the `timeline_changed` event (SPEC §11).
 *
 * Degrades gracefully when not running inside Tauri (plain `vite dev` /
 * `vite preview` in a browser): `isTauri` is false and commands resolve against
 * a local in-memory fallback so the UI shell is still explorable. The real
 * editing truth always lives in Rust when running under Tauri.
 */

import type {
  EditRequest,
  EditResult,
  TimelineSnapshot,
} from "./types";

// Tauri injects `__TAURI_INTERNALS__` on the window when running in the shell.
export const isTauri =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn = (
  event: string,
  handler: (e: { payload: unknown }) => void,
) => Promise<() => void>;

let invokeImpl: InvokeFn | null = null;
let listenImpl: ListenFn | null = null;

async function ensureTauri(): Promise<void> {
  if (!isTauri || invokeImpl) return;
  const core = await import("@tauri-apps/api/core");
  const ev = await import("@tauri-apps/api/event");
  invokeImpl = core.invoke as InvokeFn;
  listenImpl = ev.listen as unknown as ListenFn;
}

// MARK: - Commands

export async function getTimeline(): Promise<TimelineSnapshot> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<TimelineSnapshot>("get_timeline");
  return fallback.getTimeline();
}

export async function editApply(command: EditRequest): Promise<EditResult> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<EditResult>("edit_apply", { command });
  return fallback.editApply(command);
}

export async function undo(): Promise<EditResult> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<EditResult>("undo");
  return fallback.noop("Undo");
}

export async function redo(): Promise<EditResult> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<EditResult>("redo");
  return fallback.noop("Redo");
}

export async function canUndo(): Promise<boolean> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<boolean>("can_undo");
  return false;
}

export async function canRedo(): Promise<boolean> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<boolean>("can_redo");
  return false;
}

export async function projectNew(): Promise<void> {
  await ensureTauri();
  if (invokeImpl) {
    await invokeImpl<void>("project_new");
    return;
  }
  fallback.reset();
}

export async function projectOpen(path: string): Promise<TimelineSnapshot> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<TimelineSnapshot>("project_open", { path });
  return fallback.getTimeline();
}

export async function projectSave(path: string | null): Promise<string> {
  await ensureTauri();
  if (invokeImpl) return invokeImpl<string>("project_save", { path });
  return path ?? "";
}

// MARK: - Events

/** Subscribe to `timeline_changed`. Returns an unlisten function. No-op (and a
 *  no-op unlisten) when not in Tauri. */
export async function onTimelineChanged(
  handler: (version: number) => void,
): Promise<() => void> {
  await ensureTauri();
  if (!listenImpl) return () => {};
  return listenImpl("timeline_changed", (e) => {
    const payload = e.payload as { version?: number } | undefined;
    if (payload && typeof payload.version === "number") handler(payload.version);
  });
}

export async function onProjectOpened(
  handler: (path: string, version: number) => void,
): Promise<() => void> {
  await ensureTauri();
  if (!listenImpl) return () => {};
  return listenImpl("project_opened", (e) => {
    const p = e.payload as { path?: string; version?: number } | undefined;
    if (p) handler(p.path ?? "", p.version ?? 0);
  });
}

// MARK: - Browser fallback (mirror, not authoritative)
//
// When running outside Tauri there is no Rust core; provide a small in-memory
// timeline so the shell renders something. This is intentionally minimal — it
// is a preview aid, not a second editing engine.

import { createFallbackStore } from "./fallback";
const fallback = createFallbackStore();
