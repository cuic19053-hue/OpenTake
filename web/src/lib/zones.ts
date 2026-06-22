/**
 * Track zone helpers — port of upstream `zones` + `timelineTrackDisplayLabel`
 * (SPEC §5.5). Visual tracks render above audio tracks; the first audio index
 * marks the region divider. Labels are V1/A1/I1/... by kind.
 */

import type { ClipType, Timeline } from "./types";

export function firstAudioIndex(timeline: Timeline): number {
  return timeline.tracks.findIndex((t) => t.type === "audio");
}

const PREFIX: Record<ClipType, string> = {
  video: "V",
  audio: "A",
  image: "I",
  text: "T",
  lottie: "L",
};

/** "V1"/"A1"/... label for a track. Counts tracks of the same kind up to i. */
export function trackDisplayLabel(timeline: Timeline, i: number): string {
  if (i < 0 || i >= timeline.tracks.length) return "";
  const kind = timeline.tracks[i].type;
  let n = 0;
  for (let k = 0; k <= i; k++) {
    if (timeline.tracks[k].type === kind) n++;
  }
  return `${PREFIX[kind]}${n}`;
}
