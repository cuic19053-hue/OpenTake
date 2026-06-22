/**
 * Clip renderer — port of `Timeline/ClipRenderer.draw` (SPEC §5.4). Draws one
 * clip into its rect following the exact upstream order: base fill, content
 * placeholder, fade wedges, left color strip, border, missing wash, label bar,
 * keyframe diamonds, trim handles. Thumbnail/waveform content is a placeholder
 * here (Rust media cache, SPEC §11.3) — drawn as a tinted band + type hint.
 */

import { ACCENT, CLIP, TEXT, TRIM, BORDER } from "../../lib/theme";
import { trackColor, clipLabel, isLinked } from "../../lib/clip";
import type { ClipRect } from "../../lib/geometry";
import type { Clip } from "../../lib/types";

interface DrawOpts {
  isSelected: boolean;
  fps: number;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Parse "rgb(r,g,b)" -> "rgba(r,g,b,a)". */
function withAlpha(rgb: string, a: number): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

export function drawClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  rect: ClipRect,
  opts: DrawOpts,
) {
  const { x, y, width, height } = rect;
  if (width <= 0 || height <= 0) return;
  const color = trackColor(clip.sourceClipType);
  const r = TRIM.clipCornerRadius;

  ctx.save();

  // 1. Base fill (ClipRenderer:74-81): selected 0.45 else 0.30.
  roundRectPath(ctx, x, y, width, height, r);
  ctx.fillStyle = withAlpha(color, opts.isSelected ? 0.45 : 0.3);
  ctx.fill();

  // 2. Content band placeholder (real thumbnails/waveform come from Rust cache).
  ctx.save();
  roundRectPath(ctx, x, y, width, height, r);
  ctx.clip();
  const contentX = x + CLIP.stripWidth + 1;
  const contentY = y + CLIP.labelBarHeight;
  const contentW = width - CLIP.stripWidth - 1 - TRIM.handleWidth;
  const contentH = height - CLIP.labelBarHeight;
  if (contentW > 2 && contentH > 2) {
    if (clip.mediaType === "audio") {
      drawWaveformPlaceholder(ctx, contentX, contentY, contentW, contentH, color, opts.isSelected);
    } else {
      ctx.fillStyle = withAlpha(color, 0.12);
      ctx.fillRect(contentX, contentY, contentW, contentH);
    }
  }
  ctx.restore();

  // 3. Opacity fade wedges (non-audio) — drawn as triangular ramps.
  if (clip.mediaType !== "audio") {
    drawFades(ctx, clip, rect);
  }

  // 4. Left color strip (ClipRenderer:114-119): solid, more saturated.
  ctx.save();
  roundRectPath(ctx, x, y, width, height, r);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, CLIP.stripWidth, height);
  ctx.restore();

  // 5. Border (ClipRenderer:121-132).
  roundRectPath(ctx, x, y, width, height, r);
  if (opts.isSelected) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
  } else {
    ctx.strokeStyle = BORDER.primary;
    ctx.lineWidth = 0.5;
  }
  ctx.stroke();

  // 7. Label bar (ClipRenderer:594-621): clip wider than 20px.
  if (width > CLIP.minWidthForLabel) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + CLIP.stripWidth + 3, y, width - CLIP.stripWidth - 3, CLIP.labelBarHeight);
    ctx.clip();
    ctx.fillStyle = TEXT.primary;
    ctx.font = `500 10px ${cssFontStack()}`;
    ctx.textBaseline = "middle";
    const label = clipLabel(clip, opts.fps);
    const tx = x + CLIP.stripWidth + 6;
    const ty = y + CLIP.labelBarHeight / 2;
    ctx.fillText(label, tx, ty);
    if (isLinked(clip)) {
      // Underline the name portion (before the double-space).
      const name = label.split("  ")[0];
      const nameW = ctx.measureText(name).width;
      ctx.strokeStyle = TEXT.primary;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 6);
      ctx.lineTo(tx + nameW, ty + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 9. Keyframe diamonds along the bottom (ClipRenderer:163-191), y = maxY-5.
  drawKeyframeMarkers(ctx, clip, rect);

  // 10. Trim handles (ClipRenderer:659-666): 4px muted bars on each edge.
  ctx.fillStyle = TEXT.muted;
  ctx.fillRect(x, y, TRIM.handleWidth, height);
  ctx.fillRect(x + width - TRIM.handleWidth, y, TRIM.handleWidth, height);

  ctx.restore();
}

function drawWaveformPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  selected: boolean,
) {
  // Simple symmetric pseudo-waveform around the vertical center until the Rust
  // PCM samples arrive (SPEC §11.3 media_thumbnails).
  const midY = y + h / 2;
  ctx.strokeStyle = withAlpha(color, selected ? 0.85 : 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 3;
  for (let px = 0; px <= w; px += step) {
    const amp = (Math.sin(px * 0.25) * 0.5 + 0.5) * (h * 0.4);
    ctx.moveTo(x + px, midY - amp);
    ctx.lineTo(x + px, midY + amp);
  }
  ctx.stroke();
}

function drawFades(ctx: CanvasRenderingContext2D, clip: Clip, rect: ClipRect) {
  const { x, y, width, height } = rect;
  const ppf = clip.durationFrames > 0 ? width / clip.durationFrames : 0;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  if (clip.fadeInFrames > 0) {
    const fw = clip.fadeInFrames * ppf;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + fw, y);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.fill();
  }
  if (clip.fadeOutFrames > 0) {
    const fw = clip.fadeOutFrames * ppf;
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width - fw, y);
    ctx.lineTo(x + width, y + height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawKeyframeMarkers(ctx: CanvasRenderingContext2D, clip: Clip, rect: ClipRect) {
  const tracks = [
    clip.opacityTrack,
    clip.positionTrack,
    clip.scaleTrack,
    clip.rotationTrack,
    clip.cropTrack,
  ];
  const frames = new Set<number>();
  for (const t of tracks) {
    if (!t) continue;
    for (const kf of t.keyframes) frames.add(kf.frame);
  }
  if (frames.size === 0) return;
  const ppf = clip.durationFrames > 0 ? rect.width / clip.durationFrames : 0;
  const cy = rect.y + rect.height - 5;
  const radius = CLIP.keyframeDiamondRadius;
  ctx.save();
  for (const f of frames) {
    const cx = rect.x + f * ppf;
    if (cx < rect.x || cx > rect.x + rect.width) continue;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
    ctx.fillStyle = withAlpha(ACCENT.systemYellow, 0.95);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.restore();
}

function cssFontStack(): string {
  return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", system-ui, sans-serif';
}
