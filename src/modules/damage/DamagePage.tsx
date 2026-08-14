import { useMemo, useState } from "react";
import { useCatalog } from "../equipment/catalogStore";
import { ItemSprite } from "../equipment/components/ItemSprite";
import { capitalizeName, formatDamage, formatNumber, isMap } from "../equipment/format";
import type { JsonMap } from "../equipment/types";
import { AmmoPicker, ammoProjectiles } from "./components/AmmoPicker";
import { WeaponPicker } from "./components/WeaponPicker";

export function DamagePage() {
  const { catalog, error, loading, retry } = useCatalog();
  const [selectedWeaponId, setSelectedWeaponId] = useState<string | null>(null);
  const [selectedAmmoIndex, setSelectedAmmoIndex] = useState(0);

  const selectedWeapon = selectedWeaponId && catalog ? catalog.items[selectedWeaponId] : null;
  const ammunition = useMemo(() => {
    const raw = selectedWeapon?.weaponStats?.ammunition;
    return Array.isArray(raw) ? raw.filter(isMap) : [];
  }, [selectedWeapon]);
  const selectedAmmo: JsonMap | undefined = ammunition[selectedAmmoIndex];
  const projectiles = useMemo(() => ammoProjectiles(selectedAmmo), [selectedAmmo]);

  const selectWeapon = (id: string) => {
    setSelectedWeaponId(id);
    setSelectedAmmoIndex(0);
  };

  return (
    <main className="damage-page">
      <section className="damage-hero">
        <div>
          <p className="eyebrow">USCM // TTK CALCULATOR</p>
          <h1>Калькулятор урона</h1>
          <p>Оружие, боеприпасы, дистанция и броня цели — расчёт урона и времени до убийства.</p>
        </div>
        <div className="catalog-meta">
          <span>STATUS</span><strong>{loading ? "SYNC" : error ? "ERROR" : "ONLINE"}</strong>
          {catalog && <small>BUILD {catalog.gameCommit.slice(0, 8).toUpperCase()}</small>}
        </div>
      </section>

      {loading && !catalog && <div className="status-panel" role="status"><span>DATABASE MESSAGE</span><strong>Синхронизация</strong><p>Загружаю каталог снаряжения…</p></div>}
      {error && !catalog && (
        <div className="status-panel" role="status">
          <span>DATABASE MESSAGE</span><strong>Ошибка загрузки</strong><p>{error}</p>
          <button type="button" onClick={retry}>Повторить</button>
        </div>
      )}

      {catalog && (
        <div className="damage-layout">
          <section className="damage-weapon-column">
            <h2>Оружие</h2>
            <WeaponPicker catalog={catalog} selectedId={selectedWeaponId} onSelect={selectWeapon} />
          </section>

          <section className="damage-detail-column">
            {!selectedWeapon && <div className="empty-state">Выберите оружие слева.</div>}
            {selectedWeapon && (
              <>
                <div className="damage-weapon-summary">
                  <ItemSprite item={selectedWeapon} />
                  <div>
                    <strong>{capitalizeName(selectedWeapon.name)}</strong>
                    <small>{selectedWeapon.id}</small>
                  </div>
                </div>

                <dl className="stat-grid">
                  <div>
                    <dt>Скорострельность</dt>
                    <dd>
                      {selectedWeapon.weaponStats?.shotsPerSecond != null
                        ? `${formatNumber(selectedWeapon.weaponStats.shotsPerSecond)} выстр./с`
                        : "—"}
                    </dd>
                  </div>
                  {selectedWeapon.weaponStats?.damageMultiplier != null && (
                    <div>
                      <dt>Множитель урона</dt>
                      <dd>{`×${formatNumber(selectedWeapon.weaponStats.damageMultiplier)}`}</dd>
                    </div>
                  )}
                </dl>

                {ammunition.length > 0 ? (
                  <>
                    <h3>Боеприпас</h3>
                    <AmmoPicker ammunition={ammunition} selectedIndex={selectedAmmoIndex} onSelect={setSelectedAmmoIndex} />

                    <div className="projectile-list">
                      {projectiles.map((projectile, index) => (
                        <article key={`${String(projectile.projectileId)}:${index}`}>
                          <strong>{String(projectile.name ?? "Снаряд")}</strong>
                          <dl className="stat-grid">
                            <div><dt>Урон</dt><dd>{formatDamage(projectile.effectiveDamage ?? projectile.damage) ?? "—"}</dd></div>
                            {projectile.armorPiercing != null && (
                              <div><dt>Бронепробитие</dt><dd>{formatNumber(projectile.armorPiercing)}</dd></div>
                            )}
                          </dl>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">У этого оружия нет вариантов боеприпасов в каталоге.</p>
                )}

                <p className="muted damage-todo-note">
                  Обвесы, цели и дистанция — в следующих срезах.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
