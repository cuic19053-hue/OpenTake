/**
 * Timeline region (SPEC §3.1): the toolbar (height 38) stacked above the
 * timeline container, all inside one timeline PanelShell.
 */

import { PanelShell } from "../ui/PanelShell";
import { Toolbar } from "../toolbar/Toolbar";
import { TimelineContainer } from "./TimelineContainer";

export function TimelineRegion() {
  return (
    <PanelShell panel="timeline">
      <Toolbar />
      <div style={{ flex: 1, minHeight: 0 }}>
        <TimelineContainer />
      </div>
    </PanelShell>
  );
}
