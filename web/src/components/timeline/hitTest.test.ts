import { describe, expect, it } from "vitest";
import { clipsInRect, expandLinkGroup, hitTestClip } from "./hitTest";
import { LAYOUT, TRACK_SIZE, TRIM } from "../../lib/theme";
import type { Clip, ClipType, Timeline, Track } from "../../lib/types";

// Geometry constants recap (from theme.ts):
//   rulerHeight=24, dropZoneHeight=60, defaultHeight=50, TRIM.handleWidth=4.
//   trackY(0) = 24+60 = 84, clipRect y = trackY+2 = 86, height = 50-4 = 46.
//   trackY(1) = 84+50 = 134, clipRect y = 136, height = 46.

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    mediaRef: "m1",
    mediaType: "video",
    sourceClipType: "video",
    startFrame: 10,
    durationFrames: 20,
    trimStartFrame: 0,
    trimEndFrame: 0,
    speed: 1,
    volume: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    fadeInInterpolation: "smooth",
    fadeOutInterpolation: "smooth",
    opacity: 1,
    transform: {
      centerX: 0.5,
      centerY: 0.5,
      width: 1,
      height: 1,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    ...over,
  };
}

function track(type: ClipType, id: string, clips: Clip[], over: Partial<Track> = {}): Track {
  return { id, type, muted: false, hidden: false, syncLocked: true, clips, ...over };
}

function timeline(tracks: Track[]): Timeline {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    settingsConfigured: true,
    tracks,
  };
}

const PPF = 4;
const H = TRACK_SIZE.defaultHeight; // 50
// For clip(startFrame=10, durationFrames=20) at PPF=4: x=40, width=80 → [40,120].
const RULER = LAYOUT.rulerHeight + LAYOUT.dropZoneHeight; // 84
const CLIP_TOP_T0 = RULER + 2; // 86
const CLIP_TOP_T1 = RULER + H + 2; // 136

describe("hitTestClip", () => {
  it("hits a clip body on a visible track", () => {
    const t = timeline([track("video", "t0", [clip()])]);
    const hit = hitTestClip(t, 60, CLIP_TOP_T0 + 10, PPF, {});
    expect(hit).not.toBeNull();
    expect(hit?.trackIndex).toBe(0);
    expect(hit?.clipIndex).toBe(0);
    expect(hit?.region).toBe("body");
    expect(hit?.localX).toBe(20);
  });

  it("detects left trim handle (localX <= handleWidth)", () => {
    const t = timeline([track("video", "t0", [clip()])]);
    const hit = hitTestClip(t, 40 + TRIM.handleWidth, CLIP_TOP_T0 + 10, PPF, {});
    expect(hit?.region).toBe("trimLeft");
  });

  it("detects right trim handle (localX >= width - handleWidth)", () => {
    const t = timeline([track("video", "t0", [clip()])]);
    const hit = hitTestClip(t, 120 - TRIM.handleWidth, CLIP_TOP_T0 + 10, PPF, {});
    expect(hit?.region).toBe("trimRight");
  });

  it("returns null when the point is outside any clip", () => {
    const t = timeline([track("video", "t0", [clip()])]);
    expect(hitTestClip(t, 5, CLIP_TOP_T0 + 10, PPF, {})).toBeNull(); // before x
    expect(hitTestClip(t, 200, CLIP_TOP_T0 + 10, PPF, {})).toBeNull(); // after x
    expect(hitTestClip(t, 60, 0, PPF, {})).toBeNull(); // above (ruler zone)
  });

  it("skips tracks above and lands on the track whose y range contains the point", () => {
    const t = timeline([
      track("video", "t0", [clip({ id: "a" })]),
      track("video", "t1", [clip({ id: "b" })]),
    ]);
    const hitT1 = hitTestClip(t, 60, CLIP_TOP_T1 + 5, PPF, {});
    expect(hitT1?.trackIndex).toBe(1);
    expect(hitT1?.clip.id).toBe("b");
  });

  // --- Regression for issue #146 ------------------------------------------
  it("does NOT hit a clip on a hidden track (regression #146)", () => {
    // Point inside the hidden track's clip rect: with the bug, this would
    // return the hidden clip; with the fix, the hidden track is skipped and
    // no other track contains this y, so the result is null.
    const t = timeline([track("video", "t0", [clip({ id: "hidden-clip" })], { hidden: true })]);
    expect(hitTestClip(t, 60, CLIP_TOP_T0 + 10, PPF, {})).toBeNull();
  });

  it("still hits clips on visible tracks when a hidden track sits above (#146)", () => {
    const t = timeline([
      track("video", "t0", [clip({ id: "hidden", startFrame: 10, durationFrames: 20 })], {
        hidden: true,
      }),
      track("video", "t1", [clip({ id: "visible", startFrame: 10, durationFrames: 20 })]),
    ]);
    // Point inside track 1's clip rect (not track 0's).
    const hit = hitTestClip(t, 60, CLIP_TOP_T1 + 10, PPF, {});
    expect(hit?.trackIndex).toBe(1);
    expect(hit?.clip.id).toBe("visible");
  });

  it("returns null when every track containing the point is hidden (#146)", () => {
    const t = timeline([track("video", "t0", [clip()], { hidden: true })]);
    expect(hitTestClip(t, 60, CLIP_TOP_T0 + 10, PPF, {})).toBeNull();
  });

  it("ignores hidden tracks even if no visible track overlaps the point (#146)", () => {
    const t = timeline([
      track("video", "t0", [clip({ id: "hidden", durationFrames: 100 })], { hidden: true }),
    ]);
    // Wide clip on hidden track — would normally hit. Must return null.
    expect(hitTestClip(t, 200, CLIP_TOP_T0 + 10, PPF, {})).toBeNull();
  });
});

describe("clipsInRect", () => {
  it("collects ids of clips intersecting the marquee rect", () => {
    const t = timeline([
      // clip "a": x [40,120]; clip "b": x [400,480] (startFrame 100, dur 20)
      track("video", "t0", [clip({ id: "a" }), clip({ id: "b", startFrame: 100 })]),
      // clip "c": x [200,280] but on track 1 (y [136,182])
      track("audio", "t1", [clip({ id: "c", startFrame: 50 })]),
    ]);
    // Marquee x [0,200] covers only clip "a"; y is strictly inside track 0
    // (avoid the y=136 boundary that track 1's clip rect starts at).
    const ids = clipsInRect(t, 0, CLIP_TOP_T0, 200, CLIP_TOP_T0 + H - 10, PPF, {});
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(false);
    expect(ids.has("c")).toBe(false);
  });

  it("excludes clips on hidden tracks (regression #146)", () => {
    const t = timeline([
      track("video", "t0", [clip({ id: "visible" })]),
      track("video", "t1", [clip({ id: "hidden", startFrame: 10 })], { hidden: true }),
    ]);
    // Marquee covering both track y-ranges.
    const ids = clipsInRect(t, 0, CLIP_TOP_T0, 200, CLIP_TOP_T1 + H, PPF, {});
    expect(ids.has("visible")).toBe(true);
    expect(ids.has("hidden")).toBe(false);
  });
});

describe("expandLinkGroup", () => {
  it("returns the input unchanged when no clip has a linkGroupId", () => {
    const t = timeline([track("video", "t0", [clip({ id: "a" })])]);
    const out = expandLinkGroup(t, new Set(["a"]));
    expect([...out]).toEqual(["a"]);
  });

  it("expands to all clips sharing a linkGroupId with the seed", () => {
    const t = timeline([
      track("video", "t0", [
        clip({ id: "v1", linkGroupId: "g1" }),
        clip({ id: "v2", linkGroupId: "g2" }),
      ]),
      track("audio", "t1", [clip({ id: "a1", linkGroupId: "g1" })]),
    ]);
    const out = expandLinkGroup(t, new Set(["v1"]));
    expect(out.has("v1")).toBe(true);
    expect(out.has("a1")).toBe(true);
    expect(out.has("v2")).toBe(false);
  });
});
