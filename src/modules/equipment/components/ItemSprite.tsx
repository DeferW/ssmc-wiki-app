import { useState } from "react";
import { CATALOG_DATA_ROOT } from "../config";
import type { CatalogItem } from "../types";

const MAX_LOAD_ATTEMPTS = 3;

export function ItemSprite({ item, compact = false, eager = false }: {
  item: CatalogItem;
  compact?: boolean;
  eager?: boolean;
}) {
  if (!item.image) {
    return <span className={`sprite-placeholder${compact ? " is-compact" : ""}`} aria-hidden="true">?</span>;
  }
  const source = new URL(item.image, CATALOG_DATA_ROOT).toString();
  return <SpriteImage key={source} source={source} compact={compact} eager={eager} />;
}

function SpriteImage({ source, compact, eager }: { source: string; compact: boolean; eager: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retrySource = (() => {
    const url = new URL(source);
    if (attempt > 0) url.searchParams.set("sprite_retry", String(attempt));
    return url.toString();
  })();

  if (failed) {
    return <span className={`sprite-placeholder${compact ? " is-compact" : ""}`} aria-hidden="true">?</span>;
  }
  return (
    <span className={`sprite-frame${compact ? " is-compact" : ""}`}>
      <img
        src={retrySource}
        alt=""
        loading={eager || compact ? "eager" : "lazy"}
        decoding="async"
        onError={() => {
          if (attempt + 1 < MAX_LOAD_ATTEMPTS) setAttempt((value) => value + 1);
          else setFailed(true);
        }}
      />
    </span>
  );
}
