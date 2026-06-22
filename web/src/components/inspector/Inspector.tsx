/**
 * Inspector (SPEC §6). Title bar + one of four content states: marquee summary,
 * clip inspector (with Video/Audio tabs), media-asset source, or project
 * metadata. Editable fields commit via SetClipProperties. The keyframe lane and
 * Text/AI-Edit tabs are scaffolded (TODO: full parity in a later pass).
 */

import { Info, SlidersHorizontal, Diamond } from "lucide-react";
import { PanelHeaderBar } from "../ui/PanelShell";
import { Icon } from "../ui/Icon";
import { ScrubbableNumberField } from "./ScrubbableNumberField";
import { useProjectStore } from "../../store/projectStore";
import { useEditorUiStore } from "../../store/uiStore";
import * as edit from "../../store/editActions";
import { formatTimecode } from "../../lib/geometry";
import type { Clip, Timeline } from "../../lib/types";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function Inspector() {
  const timeline = useProjectStore((s) => s.timeline);
  const selectedClipIds = useEditorUiStore((s) => s.selectedClipIds);
  const inspectorTab = useEditorUiStore((s) => s.inspectorTab);
  const setInspectorTab = useEditorUiStore((s) => s.setInspectorTab);
  const keyframesPanelVisible = useEditorUiStore((s) => s.keyframesPanelVisible);
  const toggleKeyframesPanel = useEditorUiStore((s) => s.toggleKeyframesPanel);

  const selectedClips = collectSelected(timeline, selectedClipIds);
  const isMarquee = selectedClips.length > 1;
  const single = selectedClips.length === 1 ? selectedClips[0] : null;

  const title = single
    ? "Inspector"
    : isMarquee
      ? "Inspector"
      : "Timeline";
  const TitleIcon = single || isMarquee ? SlidersHorizontal : Info;

  return (
    <>
      <PanelHeaderBar>
        <span style={{ display: "inline-flex", color: "var(--text-secondary)" }}>
          <Icon icon={TitleIcon} size={13} />
        </span>
        <span style={{ fontSize: "var(--fs-sm-md)", fontWeight: "var(--fw-medium)" }}>
          {title}
        </span>
      </PanelHeaderBar>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {isMarquee ? (
          <MarqueeSummary count={selectedClips.length} />
        ) : single ? (
          <ClipInspector
            clip={single}
            tab={inspectorTab}
            setTab={setInspectorTab}
            hasAudio={single.mediaType === "audio"}
            keyframesOpen={keyframesPanelVisible}
            onToggleKeyframes={toggleKeyframesPanel}
          />
        ) : (
          <ProjectMetadata timeline={timeline} />
        )}
      </div>
    </>
  );
}

function collectSelected(timeline: Timeline, ids: Set<string>): Clip[] {
  const out: Clip[] = [];
  for (const t of timeline.tracks) for (const c of t.clips) if (ids.has(c.id)) out.push(c);
  return out;
}

function MarqueeSummary({ count }: { count: number }) {
  return (
    <div
      style={{
        padding: "var(--space-xl)",
        textAlign: "center",
        color: "var(--text-tertiary)",
        fontSize: "var(--fs-sm-md)",
      }}
    >
      {count} selected
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: "var(--fs-xxs)",
        fontWeight: "var(--fw-semibold)",
        letterSpacing: "var(--tracking-wide)",
        color: "var(--text-muted)",
        textTransform: "uppercase",
        marginBottom: "var(--space-sm)",
      }}
    >
      {label}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-sm)",
      }}
    >
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs)" }}>
        {children}
      </span>
    </div>
  );
}

function ClipInspector({
  clip,
  tab,
  setTab,
  hasAudio,
  keyframesOpen,
  onToggleKeyframes,
}: {
  clip: Clip;
  tab: string;
  setTab: (t: "text" | "video" | "audio" | "aiEdit") => void;
  hasAudio: boolean;
  keyframesOpen: boolean;
  onToggleKeyframes: () => void;
}) {
  // Available tabs depend on selection (SPEC §6.3).
  const tabs: Array<"text" | "video" | "audio" | "aiEdit"> = [];
  if (clip.mediaType === "text") tabs.push("text");
  else tabs.push("video");
  if (hasAudio) tabs.push("audio");

  const activeTab = tabs.includes(tab as never) ? tab : tabs[0];

  const commit = (props: Parameters<typeof edit.setClipProperties>[1]) =>
    edit.setClipProperties([clip.id], props);

  return (
    <div>
      {tabs.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-md)",
            padding: "var(--space-xs) var(--space-lg) 0",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                paddingBottom: 4,
                fontSize: "var(--fs-sm-md)",
                fontWeight: activeTab === t ? "var(--fw-medium)" : "var(--fw-regular)",
                color: activeTab === t ? "var(--text-primary)" : "var(--text-tertiary)",
                borderBottom:
                  activeTab === t ? "var(--bw-medium) solid var(--text-primary)" : "none",
              }}
            >
              {t === "aiEdit" ? "AI Edit" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        {activeTab === "audio" ? (
          <section>
            <SectionHeader label="Levels" />
            <Row label="Volume">
              <ScrubbableNumberField
                value={clip.volume}
                min={0}
                max={4}
                sensitivity={0.01}
                format={(v) => (20 * Math.log10(Math.max(1e-6, v))).toFixed(1)}
                suffix=" dB"
                width={56}
                displayTextOverride={(v) => (v <= 0 ? "-∞ dB" : null)}
                onCommit={(v) => commit({ volume: v })}
              />
            </Row>
          </section>
        ) : (
          <>
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SectionHeader label="Transform" />
              </div>
              <Row label="Scale">
                <ScrubbableNumberField
                  value={clip.transform.width}
                  min={0.01}
                  max={10}
                  sensitivity={0.005}
                  format={(v) => Math.round(v * 100).toString()}
                  suffix="%"
                  width={56}
                  onCommit={(v) =>
                    commit({ transform: { ...clip.transform, width: v, height: v } })
                  }
                />
              </Row>
              <Row label="Rotation">
                <ScrubbableNumberField
                  value={clip.transform.rotation}
                  min={-3600}
                  max={3600}
                  sensitivity={0.5}
                  format={(v) => v.toFixed(0)}
                  suffix="°"
                  width={56}
                  onCommit={(v) => commit({ transform: { ...clip.transform, rotation: v } })}
                />
              </Row>
              <Row label="Opacity">
                <ScrubbableNumberField
                  value={clip.opacity}
                  min={0}
                  max={1}
                  sensitivity={0.005}
                  format={(v) => Math.round(v * 100).toString()}
                  suffix="%"
                  width={56}
                  onCommit={(v) => commit({ opacity: v })}
                />
              </Row>
            </section>

            <section>
              <SectionHeader label="Playback" />
              <Row label="Speed">
                <ScrubbableNumberField
                  value={clip.speed}
                  min={0.25}
                  max={4}
                  sensitivity={0.01}
                  format={(v) => v.toFixed(2)}
                  suffix="x"
                  width={56}
                  onCommit={(v) => commit({ speed: v })}
                />
              </Row>
            </section>
          </>
        )}
      </div>

      {/* Keyframes toggle bar (SPEC §6.4). */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "var(--space-sm) var(--space-lg)",
          borderTop: "var(--bw-thin) solid var(--border-primary)",
        }}
      >
        <button
          onClick={onToggleKeyframes}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-xs)",
            color: keyframesOpen ? "var(--text-primary)" : "var(--text-tertiary)",
            fontSize: "var(--fs-sm)",
          }}
        >
          <Icon icon={Diamond} size={12} />
          Keyframes
        </button>
      </div>
    </div>
  );
}

function ProjectMetadata({ timeline }: { timeline: Timeline }) {
  const g = gcd(timeline.width, timeline.height) || 1;
  const total = timeline.tracks.reduce(
    (m, t) => Math.max(m, t.clips.reduce((mm, c) => Math.max(mm, c.startFrame + c.durationFrames), 0)),
    0,
  );
  return (
    <div style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
      <section>
        <SectionHeader label="Format" />
        <MetaRow label="Resolution" value={`${timeline.width} × ${timeline.height}`} />
        <MetaRow label="Frame Rate" value={`${timeline.fps} fps`} />
        <MetaRow label="Aspect Ratio" value={`${timeline.width / g}:${timeline.height / g}`} />
        <MetaRow label="Duration" value={formatTimecode(total, timeline.fps)} />
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-sm)",
        padding: "2px 0",
      }}
    >
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>{label}</span>
      <span
        className="tabular"
        style={{
          fontSize: "var(--fs-xs)",
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          userSelect: "text",
        }}
      >
        {value}
      </span>
    </div>
  );
}
