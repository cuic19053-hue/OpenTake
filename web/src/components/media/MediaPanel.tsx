/**
 * MediaPanel (SPEC §7). Left vertical tab rail (Media/Captions/Music) + content.
 * The Media tab shows the actions/search/context toolbar and the asset grid;
 * asset data comes from a future `get_media` command (SPEC §11), so v1 renders
 * the structure + empty/drop state. Captions/Music tabs are scaffolded.
 */

import { useState } from "react";
import { Folder, Captions, Music, Plus, Sparkles, Filter, ArrowUpDown, LayoutGrid } from "lucide-react";
import { Icon } from "../ui/Icon";
import { HoverButton } from "../ui/HoverButton";
import { useEditorUiStore, type MediaTabId } from "../../store/uiStore";

const TABS: Array<{ id: MediaTabId; icon: typeof Folder; label: string }> = [
  { id: "media", icon: Folder, label: "Media" },
  { id: "captions", icon: Captions, label: "Captions" },
  { id: "music", icon: Music, label: "Music" },
];

export function MediaPanel() {
  const mediaTab = useEditorUiStore((s) => s.mediaTab);
  const setMediaTab = useEditorUiStore((s) => s.setMediaTab);

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      <TabRail active={mediaTab} onSelect={setMediaTab} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {mediaTab === "media" && <MediaTab />}
        {mediaTab === "captions" && <Placeholder label="Captions" />}
        {mediaTab === "music" && <Placeholder label="Music" />}
      </div>
    </div>
  );
}

function TabRail({ active, onSelect }: { active: MediaTabId; onSelect: (t: MediaTabId) => void }) {
  const [hovered, setHovered] = useState<MediaTabId | null>(null);
  return (
    <div
      style={{
        width: "var(--tab-rail-width)",
        flex: "0 0 auto",
        background: "var(--bg-raised)",
        borderRight: "var(--bw-thin) solid var(--border-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-xs)",
        padding: "var(--space-sm)",
      }}
    >
      {TABS.map((t) => {
        const selected = active === t.id;
        return (
          <div
            key={t.id}
            style={{ position: "relative" }}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Selection capsule on the left edge. */}
            {selected && (
              <div
                style={{
                  position: "absolute",
                  left: -6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "var(--bw-thick)",
                  height: "var(--icon-sm)",
                  background: "var(--border-primary)",
                  borderRadius: 1,
                }}
              />
            )}
            <HoverButton
              title={t.label}
              active={selected}
              size={26}
              onClick={() => onSelect(t.id)}
            >
              <Icon icon={t.icon} size={13} strokeWidth={selected ? 2.4 : 2} />
            </HoverButton>
            {/* Hover label capsule. */}
            {hovered === t.id && !selected && (
              <div
                style={{
                  position: "absolute",
                  left: 32,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "var(--bg-prominent)",
                  border: "var(--bw-thin) solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-sm)",
                  padding: "2px 8px",
                  fontSize: "var(--fs-xs)",
                  fontWeight: "var(--fw-medium)",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                {t.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MediaTab() {
  return (
    <>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-xs)",
          padding: "var(--space-sm) var(--space-sm) var(--space-xs)",
          background: "var(--bg-surface)",
        }}
      >
        {/* actionsRow */}
        <div style={{ height: 28, display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <HoverButton title="Import Media (⌘I)">
            <Icon icon={Plus} size={13} />
          </HoverButton>
          <button
            title="Generate"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              height: 24,
              padding: "0 8px",
              borderRadius: "var(--radius-sm)",
              background: "var(--ai-gradient)",
              color: "#111",
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-medium)",
            }}
          >
            <Icon icon={Sparkles} size={12} />
            Generate
          </button>
          <div style={{ flex: 1 }} />
        </div>
        {/* searchControlsRow */}
        <div style={{ height: 28, display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <input
            placeholder="Search"
            style={{
              flex: 1,
              height: 22,
              background: "var(--bg-raised)",
              border: "var(--bw-thin) solid var(--border-primary)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "var(--fs-sm)",
              padding: "0 8px",
            }}
          />
          <HoverButton title="View mode">
            <Icon icon={LayoutGrid} size={13} />
          </HoverButton>
          <HoverButton title="Sort">
            <Icon icon={ArrowUpDown} size={13} />
          </HoverButton>
          <HoverButton title="Filter">
            <Icon icon={Filter} size={13} />
          </HoverButton>
        </div>
        {/* contextBar */}
        <div
          style={{
            height: "var(--context-row-height)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--text-tertiary)",
            fontSize: "var(--fs-xs)",
          }}
        >
          <span>Library</span>
          <span>0 items</span>
        </div>
      </div>

      {/* Grid / drop area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "var(--fs-sm-md)",
          padding: "var(--space-xl)",
          textAlign: "center",
        }}
      >
        Drop media files here, or use Import / Generate.
      </div>
    </>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: "var(--fs-sm-md)",
      }}
    >
      {label} (TODO)
    </div>
  );
}
