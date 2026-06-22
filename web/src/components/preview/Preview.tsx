/**
 * Preview (SPEC §8). Tab bar + aspect-fit canvas area + scrub bar + transport
 * bar with project-setting badges. The canvas displays Rust composite frames via
 * the `preview_frame` event (SPEC §11.2) — not yet wired, so it shows the canvas
 * background + a centered placeholder. Transport drives the local playhead.
 */

import { useLayoutEffect, useRef, useState } from "react";
import {
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Play,
  Pause,
  Camera,
} from "lucide-react";
import { PanelHeaderBar } from "../ui/PanelShell";
import { HoverButton } from "../ui/HoverButton";
import { Icon } from "../ui/Icon";
import { useProjectStore } from "../../store/projectStore";
import { useEditorUiStore } from "../../store/uiStore";
import { formatTimecode, totalFrames } from "../../lib/geometry";

export function Preview() {
  const timeline = useProjectStore((s) => s.timeline);
  const activeFrame = useEditorUiStore((s) => s.activeFrame);
  const setCurrentFrame = useEditorUiStore((s) => s.setCurrentFrame);
  const isPlaying = useEditorUiStore((s) => s.isPlaying);
  const setPlaying = useEditorUiStore((s) => s.setPlaying);
  const canvasZoom = useEditorUiStore((s) => s.canvasZoom);

  const total = totalFrames(timeline);
  const aspect = timeline.width / timeline.height;

  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      let w = cw;
      let h = cw / aspect;
      if (h > ch) {
        h = ch;
        w = ch * aspect;
      }
      setFit({ w: w * canvasZoom, h: h * canvasZoom });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, canvasZoom]);

  const seek = (frame: number) => setCurrentFrame(Math.max(0, Math.min(total, frame)));

  return (
    <>
      <PanelHeaderBar>
        <PreviewTabs />
      </PanelHeaderBar>

      {/* Canvas stage */}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: fit.w,
            height: fit.h,
            background: "var(--bg-preview-canvas)",
            border: canvasZoom < 1 ? "1px solid rgba(255,255,255,0.25)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: "var(--fs-xs)",
          }}
        >
          {/* Rust composite frame target. */}
          {timeline.tracks.length === 0 ? "No media" : `${timeline.width}×${timeline.height}`}
        </div>
      </div>

      {/* Scrub bar */}
      <ScrubBar frame={activeFrame} total={total} onSeek={seek} />

      {/* Transport bar */}
      <div
        style={{
          height: 36,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-sm)",
          padding: "0 var(--space-sm)",
          background: "var(--bg-surface)",
          borderTop: "var(--bw-thin) solid var(--border-primary)",
        }}
      >
        <span className="tabular" style={{ fontSize: "var(--fs-xs)", color: "var(--accent-timecode)" }}>
          {formatTimecode(activeFrame, timeline.fps)} / {formatTimecode(total, timeline.fps)}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <HoverButton title="Jump to Start" onClick={() => seek(0)}>
            <Icon icon={SkipBack} size={13} />
          </HoverButton>
          <HoverButton title="Step Back" onClick={() => seek(activeFrame - 1)}>
            <Icon icon={StepBack} size={13} />
          </HoverButton>
          <HoverButton title="Play/Pause (Space)" onClick={() => setPlaying(!isPlaying)}>
            <Icon icon={isPlaying ? Pause : Play} size={14} />
          </HoverButton>
          <HoverButton title="Step Forward" onClick={() => seek(activeFrame + 1)}>
            <Icon icon={StepForward} size={13} />
          </HoverButton>
          <HoverButton title="Jump to End" onClick={() => seek(total)}>
            <Icon icon={SkipForward} size={13} />
          </HoverButton>
        </div>
        <div style={{ flex: 1 }} />
        <HoverButton title="Capture Frame to Media">
          <Icon icon={Camera} size={13} />
        </HoverButton>
        <ProjectSettingsBadges fps={timeline.fps} width={timeline.width} height={timeline.height} />
      </div>
    </>
  );
}

function PreviewTabs() {
  // v1: a single non-closable "Timeline" tab (SPEC §8.3 always present).
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
      <div
        style={{
          paddingBottom: 4,
          fontSize: "var(--fs-sm-md)",
          fontWeight: "var(--fw-semibold)",
          color: "var(--text-primary)",
          borderBottom: "var(--bw-medium) solid var(--accent-primary)",
        }}
      >
        Timeline
      </div>
    </div>
  );
}

function ScrubBar({ frame, total, onSeek }: { frame: number; total: number; onSeek: (f: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const progress = total > 0 ? frame / total : 0;

  const seekFromEvent = (clientX: number) => {
    const el = ref.current;
    if (!el || total <= 0) return;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(Math.round(t * total));
  };

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        seekFromEvent(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekFromEvent(e.clientX);
      }}
      style={{
        height: 18,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        padding: "0 var(--space-sm)",
        background: "var(--bg-surface)",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          height: hover ? 4 : 3,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            background: "var(--accent-primary)",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${progress * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: hover ? 10 : 6,
            height: hover ? 10 : 6,
            borderRadius: "50%",
            background: "var(--accent-primary)",
          }}
        />
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "var(--fs-xxs)",
        fontWeight: "var(--fw-bold)",
        color: "var(--text-secondary)",
        height: "var(--icon-md-lg)",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 var(--space-sm)",
        borderRadius: "var(--radius-xs-sm)",
      }}
      className="hover-area tabular"
    >
      {children}
    </span>
  );
}

function ProjectSettingsBadges({ fps, width, height }: { fps: number; width: number; height: number }) {
  const g = gcd(width, height) || 1;
  const quality = height >= 2160 ? "4K" : height >= 1440 ? "2K" : height >= 1080 ? "FHD" : "HD";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
      <Badge>{`${width / g}:${height / g}`}</Badge>
      <Badge>{fps}</Badge>
      <Badge>{quality}</Badge>
      <Badge>Fit</Badge>
    </div>
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
