import { useEffect, useState } from "react";
import { getTroubleshootingShot, subscribeEditorTelemetry } from "./store";
import type { EditorTelemetrySnapshot } from "./types";

export function useEditorTelemetrySnapshot(): EditorTelemetrySnapshot {
  const [snapshot, setSnapshot] = useState(() => getTroubleshootingShot().snapshot);

  useEffect(() => {
    const update = () => {
      setSnapshot(getTroubleshootingShot().snapshot);
    };
    update();
    return subscribeEditorTelemetry(update);
  }, []);

  return snapshot;
}
