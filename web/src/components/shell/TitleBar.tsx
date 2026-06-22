/**
 * Title bar (SPEC §2.8), a 1:1 copy of the upstream TitleBarView. Leading: the
 * Agent-panel toggle (aiGradient bubble icon). Trailing: the Export button.
 * (UpdateBadge/Avatar belong to a separate issue.) The bubble switches between
 * the hollow (`bubble.left`) and filled (`bubble.left.fill`) glyph with the
 * Agent panel's visibility, mirroring the upstream symbol swap.
 *
 * Layout presets and panel-visibility toggles live in the §2.9 View menu
 * (ViewMenu), not here — the upstream title bar carries neither. The View-menu
 * trigger is the only added affordance, acting as the in-app menu entry point
 * for an environment without a native menu bar.
 */

import { MessageSquare, Upload } from "lucide-react";
import { Icon } from "../ui/Icon";
import { ViewMenu } from "./ViewMenu";
import { useEditorUiStore } from "../../store/uiStore";

export function TitleBar() {
  const agentVisible = useEditorUiStore((s) => s.agentPanelVisible);
  const toggleAgent = useEditorUiStore((s) => s.toggleAgentPanel);

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 38,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        padding: "0 var(--space-md)",
        background: "var(--bg-base)",
        borderBottom: "var(--bw-thin) solid var(--border-primary)",
      }}
    >
      {/* Leading: Agent toggle (aiGradient icon, hollow/filled by visibility). */}
      <button
        title="Toggle Agent Panel"
        aria-label="Toggle Agent Panel"
        aria-pressed={agentVisible}
        onClick={toggleAgent}
        className="hover-area"
        style={{
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: agentVisible ? 1 : 0.55,
        }}
      >
        <span
          style={{
            background: "var(--ai-gradient)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            display: "inline-flex",
          }}
        >
          <Icon icon={MessageSquare} size={13} fill={agentVisible ? "currentColor" : "none"} />
        </span>
      </button>

      {/* §2.9 menu entry point (hosts Layout presets + panel visibility). */}
      <ViewMenu />

      <div style={{ flex: 1 }} />

      {/* Trailing: Export. */}
      <button
        title="Export (⌘E)"
        aria-label="Export"
        className="hover-area"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: 26,
          padding: "0 var(--space-sm)",
          color: "var(--text-secondary)",
          fontSize: "var(--fs-sm)",
          fontWeight: "var(--fw-medium)",
        }}
      >
        <Icon icon={Upload} size={13} />
        Export
      </button>
    </div>
  );
}
