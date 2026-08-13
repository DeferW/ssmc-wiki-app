import { useEffect, useState } from "react";
import type { PanelPosition } from "./types";

const STORAGE_KEY = "ssmc-catalog-settings-v2";

function readPosition(): PanelPosition {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (value && typeof value === "object" && (value as { panel?: unknown }).panel === "center") return "center";
  } catch {
    // A locked or malformed localStorage should not stop the catalog.
  }
  return "right";
}

export function usePanelSettings() {
  const [panelPosition, setPanelPosition] = useState<PanelPosition>(readPosition);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ panel: panelPosition }));
    } catch {
      // The setting still works for the current tab.
    }
  }, [panelPosition]);

  return { panelPosition, setPanelPosition };
}
