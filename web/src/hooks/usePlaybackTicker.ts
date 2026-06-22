/**
 * Local playback ticker. While `isPlaying`, advances the playhead at the
 * timeline fps via requestAnimationFrame, stopping at the end. Real playback
 * (audio sync + composite frames) is a Rust concern (SPEC §11); this provides a
 * usable transport in v1.
 */

import { useEffect, useRef } from "react";
import { useEditorUiStore } from "../store/uiStore";
import { useProjectStore } from "../store/projectStore";

export function usePlaybackTicker() {
  const isPlaying = useEditorUiStore((s) => s.isPlaying);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastTsRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (ts: number) => {
      const ui = useEditorUiStore.getState();
      const tl = useProjectStore.getState().timeline;
      const fps = tl.fps > 0 ? tl.fps : 30;
      let total = 0;
      for (const t of tl.tracks)
        for (const c of t.clips) total = Math.max(total, c.startFrame + c.durationFrames);

      if (lastTsRef.current !== null) {
        const dtSec = (ts - lastTsRef.current) / 1000;
        const next = ui.activeFrame + dtSec * fps;
        if (next >= total) {
          ui.setCurrentFrame(total);
          ui.setPlaying(false);
          lastTsRef.current = null;
          return;
        }
        ui.setActiveFrame(next);
      }
      lastTsRef.current = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);
}
