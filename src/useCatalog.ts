import { useEffect, useState } from "react";
import { DATA_URL } from "./constants";
import type { Catalog } from "./types";

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "live" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(DATA_URL, { signal: controller.signal, cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Catalog>;
      })
      .then((data) => {
        if (data.schemaVersion < 3 || !data.publicCatalog?.itemIds) {
          throw new Error("Unsupported equipment catalog schema");
        }
        setCatalog(data);
        setLoadState("live");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  return { catalog, loadState };
}
