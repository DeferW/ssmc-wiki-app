import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatNumber } from "../../equipment/format";
import type { CatalogItem, JsonMap } from "../../equipment/types";
import { ballisticsFrom, coneOffset, nextScatter, scatterModel, shotAngles, type FireMode } from "../scatterModel";
import { collectAttachmentFireModes, collectRangedModifierEntries, type EquippedAttachment } from "../attachmentModifiers";
import rangeImage from "../../../assets/range-reference.png";

const MODE_LABELS: Record<FireMode, string> = { SemiAuto: "Одиночный", Burst: "Очередь", FullAuto: "Автоматический" };
type Trace = { id: number; angle: number; shot: number };

function FireModePicker({ modes, value, disabled, onChange }: {
  modes: FireMode[]; value: FireMode; disabled: boolean; onChange: (mode: FireMode) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const choose = (index: number) => { onChange(modes[index]); setOpen(false); };
  return <div className="scatter-mode-field"><span>Режим стрельбы</span>
    <div className="maps-picker-control scatter-mode-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button type="button" className="maps-picker-trigger" role="combobox" aria-label="Режим стрельбы"
        aria-expanded={open} aria-controls={id} aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled}
        onClick={() => { setActive(Math.max(0, modes.indexOf(value))); setOpen(!open); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (!["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          if (!open) { setActive(Math.max(0, modes.indexOf(value))); setOpen(true); return; }
          if (event.key === "ArrowDown") setActive((index) => (index + 1) % modes.length);
          else if (event.key === "ArrowUp") setActive((index) => (index - 1 + modes.length) % modes.length);
          else if (event.key === "Home") setActive(0);
          else if (event.key === "End") setActive(modes.length - 1);
          else choose(active);
        }}><strong>{MODE_LABELS[value]}</strong><span className="maps-picker-chevron" aria-hidden="true" /></button>
      {open && <div className="maps-picker-options" id={id} role="listbox" aria-label="Режим стрельбы">
        {modes.map((mode, index) => <button type="button" role="option" id={`${id}-${index}`} key={mode}
          tabIndex={-1} aria-selected={mode === value} className={index === active ? "is-active" : ""}
          onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)}
          onClick={() => choose(index)}><strong>{MODE_LABELS[mode]}</strong></button>)}
      </div>}
    </div>
  </div>;
}

export function ScatterRange({ weapon, attachments, projectile, gameCommit }: {
  weapon: CatalogItem | null; attachments: EquippedAttachment[]; projectile?: JsonMap; gameCommit: string;
}) {
  const config = useMemo(() => ballisticsFrom(weapon), [weapon]);
  const availableModes = useMemo(() => [...new Set([...(config?.availableModes ?? []),
    ...collectAttachmentFireModes(attachments, weapon?.tags ?? []).filter((value): value is FireMode => value in MODE_LABELS),
  ])], [config, attachments, weapon]);
  const [chosenMode, setChosenMode] = useState<FireMode>();
  const mode = chosenMode && availableModes.includes(chosenMode) ? chosenMode
    : config && availableModes.includes(config.defaultMode) ? config.defaultMode : availableModes[0] ?? "SemiAuto";
  const entries = useMemo(() => collectRangedModifierEntries(attachments, weapon?.tags ?? []), [attachments, weapon]);
  const model = useMemo(() => config ? scatterModel(config, mode, entries, projectile) : undefined, [config, mode, entries, projectile]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [last, setLast] = useState<{ shot: number; scatter: number }>();
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(10);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  const stop = () => { clearTimeout(timer.current); timer.current = undefined; setRunning(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const reset = () => { stop(); setTraces([]); setLast(undefined); };
  const fire = (shots: number) => {
    if (!model || running) return;
    setRunning(true);
    let current = model.minimum;
    let shot = 0;
    const tick = () => {
      shot += 1;
      current = nextScatter(model, current, shot > 1 && model.fireRate > 0 ? 1 / model.fireRate : 0);
      setLast({ shot, scatter: current });
      const added = shotAngles(model, current, Math.random()).map((angle) => ({ id: sequence.current++, angle, shot }));
      setTraces((old) => [...old, ...added].slice(-240));
      if (shot < shots) timer.current = setTimeout(tick, 1000 / model.fireRate);
      else setRunning(false);
    };
    tick();
  };
  const unsupported = !config || config.unsupported.length > 0;
  const maxAngle = model ? (model.pellets > 1 ? model.pelletSpread : model.maximum) : 0;
  const minAngle = model ? (model.pellets > 1 ? model.pelletSpread : model.minimum) : 0;
  const currentAngle = model && model.pellets > 1 ? model.pelletSpread : last?.scatter ?? model?.minimum ?? 0;
  const padding = Math.max(0, coneOffset(650, maxAngle) - 150);
  const polygon = (angle: number) => `110,170 760,${170 - coneOffset(650, angle)} 760,${170 + coneOffset(650, angle)}`;
  const source = `https://github.com/MetalSage/space-stories-cm14/blob/${config?.rulesCommit ?? gameCommit}/Content.Shared/Weapons/Ranged/Systems/SharedGunSystem.cs`;
  return <section className="damage-loadout scatter-panel">
    <header className="damage-panel-header"><span className="damage-panel-index">02</span><div>
      <p>FIRING RANGE</p><h2>Отдача и разброс</h2><small>Секторы вылета пуль и следы выстрелов выбранной сборки.</small>
    </div></header>
    {!weapon ? <div className="damage-panel-empty"><strong>Соберите оружие слева</strong><p>После выбора появятся границы разброса и управление стрельбой.</p></div>
      : unsupported ? <div className="damage-panel-empty"><strong>Модель для этого оружия пока недоступна</strong><p>Нужны параметры обычного огнестрельного оружия RMC. Особые системы стрельбы не заменяются приблизительными числами.</p></div>
      : model && <>
        <div className="scatter-controls">
          <FireModePicker modes={availableModes} value={mode} disabled={running}
            onChange={(value) => { reset(); setChosenMode(value); }} />
          <label>Выстрелов в серии<input aria-label="Выстрелов в серии" type="number" min="1" max="60" value={count} disabled={running}
            onChange={(event) => setCount(Math.max(1, Math.min(60, Math.round(Number(event.target.value) || 1))))} /></label>
          <button type="button" disabled={running || model.fireRate <= 0} onClick={() => fire(mode === "Burst" ? model.burstSize : 1)}>{mode === "Burst" ? `Очередь (${model.burstSize})` : "Выстрел"}</button>
          <button type="button" disabled={running || mode !== "FullAuto" || model.fireRate <= 0} onClick={() => fire(count)}>Зажать спуск</button>
          {running && <button type="button" onClick={stop}>Отпустить спуск</button>}
          <button type="button" onClick={reset}>Очистить</button>
        </div>
        <div className="scatter-legend"><span className="scatter-min">Минимальный сектор</span><span className="scatter-max">Максимальный сектор</span><span className="scatter-current">Последний выстрел</span></div>
        <svg className="scatter-scene" viewBox={`0 ${-padding} 811 ${329 + padding * 2}`} role="img" aria-label={`Полигон: минимальный разброс ${formatNumber(minAngle)} градусов, максимальный ${formatNumber(maxAngle)} градусов`}>
          <image href={rangeImage} x="0" y="0" width="811" height="329" />
          <polygon points={polygon(maxAngle)} className="scatter-cone-max" />
          <polygon points={polygon(minAngle)} className="scatter-cone-min" />
          <polygon points={polygon(currentAngle)} className="scatter-cone-current" />
          <path d="M110 170H760" stroke="#fff9" strokeDasharray="5 7" />
          <path d="M654 45V295" stroke="#fff7" strokeDasharray="3 6" />
          {traces.map((trace) => {
            const angle = trace.angle * Math.PI / 180;
            return <g key={trace.id}><path className="scatter-trace" d={`M110 170l${650 * Math.cos(angle)} ${650 * Math.sin(angle)}`} />
              <circle cx={110 + 544 * Math.cos(angle)} cy={170 + 544 * Math.sin(angle)} r="2.7" fill="#f9f1b6" opacity=".8"><title>Выстрел {trace.shot}: {formatNumber(trace.angle)}°</title></circle></g>;
          })}
          <circle cx="110" cy="170" r="5" fill="#72d895" stroke="#fff" />
        </svg>
        <div className="scatter-readouts">
          <div><span>Минимум / максимум</span><strong>{formatNumber(minAngle)}° / {formatNumber(maxAngle)}°</strong><small>Полный угол вылета; отклонение — ± половина.</small></div>
          <div><span>Последний выстрел</span><strong>{last ? `№${last.shot} · ±${formatNumber(currentAngle / 2)}°` : "Ожидание"}</strong><small>Граница направления этого выстрела.</small></div>
          <div><span>Отдача камеры</span><strong>×{formatNumber(model.recoil)}</strong><small>Толчок за выстрел: {formatNumber(model.recoil * 0.5)} м до ограничения камеры.</small></div>
          <div><span>Снарядов за выстрел</span><strong>{model.pellets}</strong><small>Разлёт боеприпаса: {formatNumber(model.pelletSpread)}°.</small></div>
        </div>
        {model.pellets > 1 && <p className="scatter-note">В этой версии игры дробовой веер строится вокруг исходной точки прицеливания, без случайного поворота от разброса оружия. Показан фактический веер с поправками обвесов.</p>}
        <p className="scatter-note">Базовая сборка в двух руках: поправки на навыки стрелка, движение и временные эффекты не включены. Новый спуск начинает серию с минимального разброса. Точность попадания в моба рассчитывается игрой отдельно и не сужает этот сектор.</p>
        <p className="scatter-note">Фон — визуальный ориентир из предоставленного скриншота. Стены и цель не участвуют в расчёте столкновений. Следы показывают направления, а не скорость полёта или гарантированные попадания; случайные результаты не повторяют серверный генератор.</p>
        <a className="scatter-source" href={source} target="_blank" rel="noreferrer">Механика официальной сборки · {config.rulesCommit.slice(0, 8)}</a>
      </>}
  </section>;
}
