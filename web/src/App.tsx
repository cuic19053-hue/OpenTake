import { useEffect } from "react";
import { TitleBar } from "./components/shell/TitleBar";
import { EditorSplit } from "./components/shell/EditorSplit";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePlaybackTicker } from "./hooks/usePlaybackTicker";
import { startSync } from "./store/sync";

export default function App() {
  useKeyboardShortcuts();
  usePlaybackTicker();

  useEffect(() => {
    void startSync();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorSplit />
      </div>
    </div>
  );
}
