import { formatDamage, formatNumber } from "../../equipment/format";
import { ammoNeeded, simulateEngagement } from "../damageMath";
import type {
  ArmorTarget,
  DamageFalloffThreshold,
  DamageTypeMap,
  GunStacksConfig,
  HitDirection,
  WeaponCategory,
} from "../damageMath";
import type { MobThresholdPair } from "../mobTypes";
import type { SimulatedShot } from "../damageMath";

function formatHits(value: number): string {
  return Number.isFinite(value) ? formatNumber(value) : "—";
}

function formatSeconds(value: number): string {
  return Number.isFinite(value) ? `${formatNumber(value)} с` : "—";
}

// Never render dozens of rows for a weak weapon that needs a long magazine
// dump — show the ramp-up at the start and the final stretch before the
// kill, with a gap marker for whatever's skipped in between.
const MAX_DISPLAYED_SHOTS = 12;
const HEAD_SHOTS = 8;

function visibleShotRows(shots: SimulatedShot[]): (SimulatedShot | "gap")[] {
  if (shots.length <= MAX_DISPLAYED_SHOTS) return shots;
  const tailCount = MAX_DISPLAYED_SHOTS - HEAD_SHOTS;
  return [...shots.slice(0, HEAD_SHOTS), "gap" as const, ...shots.slice(shots.length - tailCount)];
}

export function ResultPanel({
  effectiveDamage,
  distance,
  falloffThresholds,
  weaponFalloffMultiplier,
  baseArmorPiercing,
  baseDamageMultiplier,
  baseShotsPerSecond,
  weaponCategory,
  target,
  hitDirection,
  thresholds,
  magazineCapacity,
  gunStacks,
}: {
  effectiveDamage: DamageTypeMap;
  distance: number;
  falloffThresholds: DamageFalloffThreshold[];
  weaponFalloffMultiplier: number;
  baseArmorPiercing: number;
  baseDamageMultiplier: number;
  baseShotsPerSecond: number;
  weaponCategory: WeaponCategory;
  target: ArmorTarget;
  hitDirection: HitDirection;
  thresholds: MobThresholdPair;
  magazineCapacity: number | null;
  gunStacks?: GunStacksConfig;
}) {
  const engagement = simulateEngagement({
    effectiveDamage,
    distance,
    falloffThresholds,
    weaponFalloffMultiplier,
    baseArmorPiercing,
    baseDamageMultiplier,
    baseShotsPerSecond,
    weaponCategory,
    target,
    hitDirection,
    gunStacks,
  }, thresholds);

  const ammoDead = ammoNeeded(engagement.hitsToDead, magazineCapacity);
  const firstShot = engagement.shots[0];

  return (
    <section className="result-panel">
      <h3>Результат</h3>
      <dl className="stat-grid">
        <div><dt>Урон 1-го попадания</dt><dd>{firstShot ? formatDamage({ Piercing: firstShot.totalDamage }) ?? formatNumber(firstShot.totalDamage) : "—"}</dd></div>
        <div><dt>До обездвиживания</dt><dd>{formatHits(engagement.hitsToCritical)}</dd></div>
        <div><dt>До смерти</dt><dd>{formatHits(engagement.hitsToDead)}</dd></div>
        <div><dt>Время до обездвиживания</dt><dd>{formatSeconds(engagement.timeToCriticalSeconds)}</dd></div>
        <div><dt>Время до смерти</dt><dd>{formatSeconds(engagement.timeToDeadSeconds)}</dd></div>
        <div>
          <dt>Патронов нужно</dt>
          <dd>
            {Number.isFinite(engagement.hitsToDead)
              ? `${formatNumber(ammoDead.shots)}${ammoDead.magazines != null ? ` (${formatNumber(ammoDead.magazines)} магазин${ammoDead.magazines === 1 ? "" : "а"})` : ""}`
              : "—"}
          </dd>
        </div>
      </dl>

      {gunStacks && engagement.shots.length > 1 && (
        <div className="shot-progression">
          <h4>Прогрессия по выстрелам</h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Урон</th>
                <th>Суммарно</th>
                <th>БП</th>
                <th>Множитель</th>
                <th>Темп</th>
              </tr>
            </thead>
            <tbody>
              {visibleShotRows(engagement.shots).map((shot, index) => (
                shot === "gap" ? (
                  <tr key="gap" className="shot-progression-gap">
                    <td colSpan={6}>⋮ ещё {engagement.shots.length - MAX_DISPLAYED_SHOTS} выстрелов</td>
                  </tr>
                ) : (
                  <tr key={`${shot.index}:${index}`}>
                    <td>{shot.index}</td>
                    <td>{formatNumber(shot.totalDamage)}</td>
                    <td>{formatNumber(shot.cumulativeDamage)}</td>
                    <td>{formatNumber(shot.armorPiercing)}</td>
                    <td>×{formatNumber(shot.damageMultiplier)}</td>
                    <td>{formatNumber(shot.shotsPerSecond)}/с</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
