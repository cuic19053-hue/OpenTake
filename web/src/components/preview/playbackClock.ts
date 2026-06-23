/**
 * Tiny ownership flag so the two playback clocks never both advance the
 * playhead. While `<TimelinePlayback>` is mounted it drives `activeFrame` from
 * the real media elements (audio/video) and CLAIMS the clock; the fallback
 * `usePlaybackTicker` (a plain dt-based rAF, used when no preview/media element
 * is available) then YIELDS instead of advancing. If the media clock releases
 * mid-playback (e.g. the preview panel unmounts), the fallback resumes.
 */

let owner = false;

export const mediaClock = {
  claim(): void {
    owner = true;
  },
  release(): void {
    owner = false;
  },
  get active(): boolean {
    return owner;
  },
};
