import { useEffect } from "react";
import { TitleBar } from "./components/shell/TitleBar";
import { EditorSplit } from "./components/shell/EditorSplit";
import { HomeView } from "./components/home/HomeView";
import { SettingsView } from "./components/settings/SettingsView";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePlaybackTicker } from "./hooks/usePlaybackTicker";
import { startSync } from "./store/sync";
import { startMediaSync } from "./store/mediaStore";
import { useEditorUiStore } from "./store/uiStore";
import { initI18n } from "./i18n";
import { initTheme } from "./store/settingsStore";

export default function App() {
  // Editor-only hooks are safe to keep mounted across views: they only act on
  // editor state/events and the keyboard handler is a no-op until the editor is
  // shown (no selection / no focus). Keeping them unconditional preserves hook
  // order across navigation.
  useKeyboardShortcuts();
  usePlaybackTicker();

  const view = useEditorUiStore((s) => s.view);

  useEffect(() => {
    initI18n();
    initTheme();
    void startSync();
    void startMediaSync();
  }, []);

  if (view === "home") return <HomeView />;
  if (view === "settings") return <SettingsView />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorSplit />
      </div>
    </div>
  );
}
