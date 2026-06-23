import { describe, expect, it } from "vitest";
import { dbFromLinear, waveformSampleRange } from "./clipRenderer";

describe("dbFromLinear", () => {
  it("maps unity to 0 dB", () => {
    expect(dbFromLinear(1)).toBeCloseTo(0);
  });
  it("clamps to the floor at/below silence", () => {
    expect(dbFromLinear(0)).toBe(-60);
    expect(dbFromLinear(-1)).toBe(-60);
    expect(dbFromLinear(0.0001)).toBe(-60); // -80dB clamps up to floor
  });
  it("clamps to the +15 dB ceiling", () => {
    expect(dbFromLinear(100)).toBe(15);
  });
  it("is ~-6 dB at half amplitude", () => {
    expect(dbFromLinear(0.5)).toBeCloseTo(-6.02, 1);
  });
});

describe("waveformSampleRange", () => {
  const base = { durationFrames: 100, speed: 1, trimStartFrame: 0, trimEndFrame: 0 };

  it("untrimmed clip spans the whole sample array", () => {
    expect(waveformSampleRange(base, 1000)).toEqual({ start: 0, end: 1000 });
  });

  it("leading + trailing trim map proportionally", () => {
    // consumed=100, total=100+50+50=200 → start=50/200=0.25, end=150/200=0.75.
    const r = waveformSampleRange({ ...base, trimStartFrame: 50, trimEndFrame: 50 }, 1000);
    expect(r).toEqual({ start: 250, end: 750 });
  });

  it("speed changes the consumed source span", () => {
    // speed 2 → consumed=200, total=200 (no trim) → full range.
    const r = waveformSampleRange({ ...base, speed: 2 }, 1000);
    expect(r).toEqual({ start: 0, end: 1000 });
    // with leading trim 100: total=300, start=100/300, end=300/300.
    const r2 = waveformSampleRange({ ...base, speed: 2, trimStartFrame: 100 }, 900);
    expect(r2).toEqual({ start: 300, end: 900 });
  });

  it("returns an empty range for degenerate input", () => {
    expect(waveformSampleRange({ ...base, durationFrames: 0 }, 1000)).toEqual({ start: 0, end: 0 });
    expect(waveformSampleRange(base, 0)).toEqual({ start: 0, end: 0 });
  });
});
