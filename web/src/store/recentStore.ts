/**
 * Recent-projects list for the Home view. Stores the absolute paths of recently
 * opened `.opentake` bundles (most-recent first, capped) in localStorage — a
 * front-end-only convenience that mirrors upstream `ProjectRegistry`'s recents,
 * without the on-disk thumbnail/metadata index (a later concern).
 */

import { create } from "zustand";

const LS_RECENTS = "recentProjects";
const MAX_RECENTS = 12;

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number; // epoch ms
}

function load(): RecentProject[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_RECENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentProject =>
        !!e && typeof e === "object" && typeof (e as RecentProject).path === "string",
    );
  } catch {
    return [];
  }
}

function persist(list: RecentProject[]) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LS_RECENTS, JSON.stringify(list));
  }
}

/** Derive a display name from a bundle path (its last path segment, minus the
 *  `.opentake` extension). */
export function projectNameFromPath(path: string): string {
  const segment = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return segment.replace(/\.opentake$/i, "");
}

interface RecentState {
  recents: RecentProject[];
  add: (path: string) => void;
  remove: (path: string) => void;
}

export const useRecentStore = create<RecentState>((set, get) => ({
  recents: load(),
  add: (path) => {
    const entry: RecentProject = {
      path,
      name: projectNameFromPath(path),
      openedAt: Date.now(),
    };
    const next = [entry, ...get().recents.filter((r) => r.path !== path)].slice(0, MAX_RECENTS);
    persist(next);
    set({ recents: next });
  },
  remove: (path) => {
    const next = get().recents.filter((r) => r.path !== path);
    persist(next);
    set({ recents: next });
  },
}));
