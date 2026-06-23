/**
 * Title bar (SPEC §2.8). Leading: Home (return to launcher). Trailing:
 * Settings + Export. (UpdateBadge/Avatar belong to a separate issue.)
 *
 * The Agent panel is toggled from the §2.9 View menu (ViewMenu) and the
 * keyboard shortcut — the dedicated title-bar toggle button was removed by
 * request. Layout presets and panel-visibility toggles also live in the View
 * menu, the in-app menu entry point for an environment without a native menu bar.
 */

import { Upload, Home, Settings as SettingsIcon } from "lucide-react";
import { Icon } from "../ui/Icon";
import { ViewMenu } from "./ViewMenu";
import { useEditorUiStore } from "../../store/uiStore";
import { useT } from "../../i18n";

export function TitleBar() {
  const setView = useEditorUiStore((s) => s.setView);
  const t = useT();

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 38,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        padding: "0 var(--space-md) 0 var(--titlebar-safe-left)",
        background: "var(--bg-base)",
        borderBottom: "var(--bw-thin) solid var(--border-primary)",
      }}
    >
      {/* Leading: Home (return to launcher). */}
      <button
        title={t("title.backHome")}
        aria-label={t("title.backHome")}
        onClick={() => setView("home")}
        className="hover-area"
        style={{
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
        }}
      >
        <Icon icon={Home} size={13} />
      </button>

      {/* §2.9 menu entry point (hosts Layout presets + Agent panel + visibility). */}
      <ViewMenu />

      <div style={{ flex: 1 }} />

      {/* Trailing: Settings + Export. */}
      <button
        title={t("title.settings")}
        aria-label={t("title.settings")}
        onClick={() => setView("settings")}
        className="hover-area"
        style={{
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
        }}
      >
        <Icon icon={SettingsIcon} size={13} />
      </button>
      <button
        title={t("title.exportHint")}
        aria-label={t("title.export")}
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
        {t("title.export")}
      </button>
    </div>
  );
}
