const PRESETS = [1, 5, 10, 15];
const MIN_DISTANCE = 0;
const MAX_DISTANCE = 40;

function distanceWord(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return "тайл";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "тайла";
  return "тайлов";
}

export function DistanceControl({ distance, onChange }: {
  distance: number;
  onChange: (value: number) => void;
}) {
  const clamp = (value: number) => Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, value));

  return (
    <div className="distance-control">
      <div className="distance-slider-row">
        <button
          type="button"
          className="distance-step"
          onClick={() => onChange(clamp(distance - 1))}
          disabled={distance <= MIN_DISTANCE}
          aria-label="Уменьшить дистанцию на тайл"
        >
          −
        </button>
        <input
          type="range"
          className="distance-slider"
          min={MIN_DISTANCE}
          max={MAX_DISTANCE}
          step={1}
          value={distance}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          aria-label="Дистанция в тайлах"
        />
        <button
          type="button"
          className="distance-step"
          onClick={() => onChange(clamp(distance + 1))}
          disabled={distance >= MAX_DISTANCE}
          aria-label="Увеличить дистанцию на тайл"
        >
          +
        </button>
        <output className="distance-value">{distance} {distanceWord(distance)}</output>
      </div>
      <div className="distance-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={distance === preset ? "is-active" : ""}
            onClick={() => onChange(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
