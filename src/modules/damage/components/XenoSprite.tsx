import { MOBS_DATA_ROOT } from "../mobConfig";
import type { XenoCaste } from "../mobTypes";

export function XenoSprite({ caste, compact = false }: { caste: XenoCaste; compact?: boolean }) {
  if (!caste.sprite) {
    return <span className={`sprite-placeholder${compact ? " is-compact" : ""}`} aria-hidden="true">?</span>;
  }
  const source = new URL(caste.sprite, MOBS_DATA_ROOT).toString();
  return (
    <span className={`sprite-frame${compact ? " is-compact" : ""}`}>
      <img src={source} alt="" loading="lazy" decoding="async" />
    </span>
  );
}
