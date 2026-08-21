import { useState } from "react";
import { formatNumber } from "../../equipment/format";
import {
  aimDurationSeconds,
  computeAimedShot,
  type AimedShotAbility,
  type AimedShotEffectConfig,
} from "../aimedShot";
import type { ArmorTarget, DamageFalloffThreshold, DamageTypeMap, HitDirection, WeaponCategory } from "../damageMath";
import type { RmcSize } from "../mobTypes";

const FOCUS_COUNTERS = [1, 2, 3] as const;

export function AimedShotCard({
  ability,
  hasFocusedShooting,
  effect,
  distance,
  effectiveDamage,
  falloffThresholds,
  weaponFalloffMultiplier,
  armorPiercing,
  weaponCategory,
  target,
  hitDirection,
  targetSize,
  criticalThreshold,
}: {
  ability: AimedShotAbility;
  hasFocusedShooting: boolean;
  effect: AimedShotEffectConfig | undefined;
  distance: number;
  effectiveDamage: DamageTypeMap;
  falloffThresholds: DamageFalloffThreshold[];
  weaponFalloffMultiplier: number;
  armorPiercing: number;
  weaponCategory: WeaponCategory;
  target: ArmorTarget;
  hitDirection: HitDirection;
  targetSize: RmcSize | null;
  criticalThreshold: number | null;
}) {
  const [focusCounter, setFocusCounter] = useState<number>(1);

  const result = computeAimedShot({
    effectiveDamage,
    distance,
    falloffThresholds,
    weaponFalloffMultiplier,
    armorPiercing,
    weaponCategory,
    target,
    hitDirection,
    effect,
    hasFocusedShooting,
    targetSize,
    focusCounter,
    criticalThreshold,
  });

  const showFocusPicker = hasFocusedShooting && (result.bonus.focusTier === "normal" || result.bonus.focusTier === "big");
  const debuffs: { label: string; value: string }[] = [];
  if (result.bonus.blindDuration > 0) debuffs.push({ label: "Ослепление", value: `${formatNumber(result.bonus.blindDuration)} с` });
  if (result.bonus.slowDuration > 0) debuffs.push({ label: "Замедление", value: `${formatNumber(result.bonus.slowDuration)} с` });
  if (result.bonus.superSlowDuration > 0) debuffs.push({ label: "Сильное замедление", value: `${formatNumber(result.bonus.superSlowDuration)} с` });
  if (result.bonus.fireStacksOnHit > 0) debuffs.push({ label: "Поджог", value: `${formatNumber(result.bonus.fireStacksOnHit)} стак.` });

  return (
    <section className="aimed-shot-card">
      <h3>Прицельный выстрел</h3>
      <dl className="stat-grid">
        <div><dt>Время прицеливания</dt><dd>{formatNumber(aimDurationSeconds(ability, distance))} с</dd></div>
        <div><dt>Перезарядка способности</dt><dd>{formatNumber(ability.aimedShotCooldown)} с</dd></div>
        <div><dt>Урон обычного попадания</dt><dd>{formatNumber(result.primaryDamage)}</dd></div>
        <div><dt>Бонусный урон</dt><dd>{formatNumber(result.bonusDamage)}</dd></div>
        <div><dt>Итоговый урон</dt><dd>{formatNumber(result.totalDamage)}</dd></div>
      </dl>

      {showFocusPicker && (
        <div className="loadout-row">
          <span className="muted">Выстрел серии по одной цели:</span>
          <div className="direction-control" role="radiogroup" aria-label="Номер выстрела в серии фокусировки">
            {FOCUS_COUNTERS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={focusCounter === value}
                className={focusCounter === value ? "is-active" : ""}
                onClick={() => setFocusCounter(value)}
              >
                {value}-й
              </button>
            ))}
          </div>
        </div>
      )}

      {debuffs.length > 0 ? (
        <dl className="stat-grid">
          {debuffs.map((debuff) => (
            <div key={debuff.label}><dt>{debuff.label}</dt><dd>{debuff.value}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="muted">Этот выстрел не накладывает дебаффов.</p>
      )}
    </section>
  );
}
