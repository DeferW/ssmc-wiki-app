import { formatDamage, formatNumber } from "../../equipment/format";
import { ammoNeeded, simulateEngagement } from "../damageMath";
import type {
  ArmorTarget,
  DamageFalloffThreshold,
  DamageTypeMap,
  GunStacksConfig,
  HitDirection,
  HoloTargetingConfig,
  OverheatConfig,
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
  projectilesPerShot,
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
  overheat,
  holoTargeting,
}: {
  effectiveDamage: DamageTypeMap;
  projectilesPerShot?: number;
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
  overheat?: OverheatConfig;
  holoTargeting?: HoloTargetingConfig;
}) {
  const engagement = simulateEngagement({
    effectiveDamage,
    projectilesPerShot,
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
    overheat,
    holoTargeting,
  }, thresholds);

  const ammoDead = ammoNeeded(engagement.hitsToDead, magazineCapacity);
  const firstShot = engagement.shots[0];
  const lastShot = engagement.shots.at(-1);
  const progressionColumnCount = 6 + (overheat ? 1 : 0) + (holoTargeting ? 1 : 0);

  return (
    <section className="result-panel">
      <h3>Результат</h3>
      <dl className="stat-grid">
        <div><dt>Урон 1-го выстрела</dt><dd>{firstShot ? formatDamage({ Piercing: firstShot.totalDamage }) ?? formatNumber(firstShot.totalDamage) : "—"}</dd></div>
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
        {overheat && <div><dt>Перегревов за бой</dt><dd>{engagement.overheatCount}</dd></div>}
        {holoTargeting && lastShot?.holoStacks != null && (
          <div>
            <dt>НТ-метка к последнему попаданию</dt>
            <dd>{formatNumber(lastShot.holoStacks)} стаков · +{formatNumber((lastShot.holoDamageMultiplier! - 1) * 100)}%</dd>
          </div>
        )}
      </dl>

      {projectilesPerShot != null && projectilesPerShot > 1 && (
        <p className="holo-targeting-note">
          Указан суммарный урон при попадании всех {formatNumber(projectilesPerShot)} снарядов. Разлёт отдельных снарядов по разным целям не моделируется.
        </p>
      )}

      {holoTargeting && (
        <p className="holo-targeting-note">
          НТ-метка применяется до урона попадания и усиливает любой входящий урон по цели.
        </p>
      )}

      {(gunStacks || overheat || holoTargeting) && engagement.shots.length > 1 && (
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
                {holoTargeting && <th>НТ-метка</th>}
                {overheat && <th>Нагрев</th>}
              </tr>
            </thead>
            <tbody>
              {visibleShotRows(engagement.shots).map((shot, index) => (
                shot === "gap" ? (
                  <tr key="gap" className="shot-progression-gap">
                    <td colSpan={progressionColumnCount}>⋮ ещё {engagement.shots.length - MAX_DISPLAYED_SHOTS} выстрелов</td>
                  </tr>
                ) : (
                  <tr key={`${shot.index}:${index}`}>
                    <td>{shot.index}</td>
                    <td>{formatNumber(shot.totalDamage)}</td>
                    <td>{formatNumber(shot.cumulativeDamage)}</td>
                    <td>{formatNumber(shot.armorPiercing)}</td>
                    <td>×{formatNumber(shot.damageMultiplier)}</td>
                    <td>{formatNumber(shot.shotsPerSecond)}/с</td>
                    {holoTargeting && (
                      <td>{formatNumber(shot.holoStacks ?? 0)} · +{formatNumber(((shot.holoDamageMultiplier ?? 1) - 1) * 100)}%</td>
                    )}
                    {overheat && <td className={shot.overheated ? "is-overheated" : ""}>{formatNumber(shot.heatAfterShot ?? 0)}{shot.overheated ? " · ПЕРЕГРЕВ" : ""}</td>}
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
