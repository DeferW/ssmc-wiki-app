import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ZoneTemplate } from "../fireZones";
import { MAX_ZONES } from "../fireZones";
import { decodePlan, encodePlan, PlanCodeError, type DecodedPlan } from "./codec";
import { MAX_ELEMENTS, MAX_LABEL_LENGTH, MAX_WIDTH, MIN_WIDTH, PLAN_COLORS, STAMPS, UNITS_PER_TILE } from "./model";
import { drawStamp } from "./render";
import { deleteSavedPlan, loadSavedPlans, storeSavedPlan, type SavedPlan } from "./storage";
import type { Planner, PlannerTool } from "./usePlanner";

const ICONS: Record<PlannerTool, ReactNode> = {
  pan: <path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3" />,
  select: <path d="m5 3 14 8-6 1.5L10 19 5 3Z" />,
  brush: <path d="M4 18c3 0 3-4 6-4s2 4 5 4 4-6 5-8" />,
  line: <path d="M5 19 19 5" />,
  arrow: <path d="M5 19 19 5m0 0h-7m7 0v7" />,
  area: <path d="M5 6h14v12H5z" />,
  label: <path d="M5 6h14M12 6v13M9 19h6" />,
  stamp: <path d="M12 3a5 5 0 0 1 3 9v2h4v4H5v-4h4v-2a5 5 0 0 1 3-9ZM5 21h14" />,
  zone: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />,
  eraser: <path d="m4 15 9-9 7 7-6 6H8l-4-4Zm5-5 7 7M8 19h12" />,
};

const TOOLS: { id: PlannerTool; label: string; hint: string }[] = [
  { id: "pan", label: "Карта", hint: "Двигать и приближать карту" },
  { id: "select", label: "Выбор", hint: "Выделить, перетащить, удалить (Delete)" },
  { id: "brush", label: "Кисть", hint: "Свободное рисование" },
  { id: "line", label: "Линия", hint: "Прямая линия; Shift — привязка к 8 направлениям, как в игре" },
  { id: "arrow", label: "Стрелка", hint: "Направление атаки или отхода" },
  { id: "area", label: "Область", hint: "Прямоугольник" },
  { id: "label", label: "Метка", hint: "Текст на карте; нажмите на метку, чтобы изменить" },
  { id: "stamp", label: "Значок", hint: "Символ на карте; нажатие тем же значком убирает его" },
  { id: "zone", label: "Зона", hint: "Зоны огня: OB, миномёт, ядро, пилон" },
  { id: "eraser", label: "Ластик", hint: "Проведите по тому, что нужно стереть" },
];

const NOUNS = {
  stroke: ["линия", "линии", "линий"],
  arrow: ["стрелка", "стрелки", "стрелок"],
  area: ["область", "области", "областей"],
  label: ["метка", "метки", "меток"],
  stamp: ["значок", "значка", "значков"],
  zone: ["зона", "зоны", "зон"],
} as const;

function plural(count: number, forms: readonly [string, string, string]): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (units === 1) return forms[0];
  if (units >= 2 && units <= 4) return forms[1];
  return forms[2];
}

const HELP_SEEN_KEY = "ssmc-planner-help-seen-v1";

function helpSeen(): boolean {
  try { return localStorage.getItem(HELP_SEEN_KEY) === "1"; } catch { return false; }
}

function markHelpSeen() {
  try { localStorage.setItem(HELP_SEEN_KEY, "1"); } catch { /* private mode: the tip just shows again */ }
}

type InputKinds = { mouse: boolean; touch: boolean };

/**
 * Which controls to explain, from what the device can do rather than its name:
 * a precise pointer means mouse or trackpad, a coarse one means fingers. A touch
 * laptop or a tablet with a mouse has both, so it gets both blocks.
 */
export function inputKinds(matches: (query: string) => boolean): InputKinds {
  const mouse = matches("(any-pointer: fine)");
  const touch = matches("(any-pointer: coarse)");
  return mouse || touch ? { mouse, touch } : { mouse: true, touch: true };
}

function useInputKinds(): InputKinds {
  const read = () => inputKinds((query) => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  const [kinds, setKinds] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const queries = ["(any-pointer: fine)", "(any-pointer: coarse)"].map((query) => window.matchMedia(query));
    // A mouse plugged into a tablet changes the answer while the page is open.
    const update = () => setKinds(inputKinds((query) => window.matchMedia(query).matches));
    queries.forEach((query) => query.addEventListener("change", update));
    return () => queries.forEach((query) => query.removeEventListener("change", update));
  }, []);
  return kinds;
}

function ControlsHelp() {
  const { mouse, touch } = useInputKinds();
  return (
    <div className="maps-planner-help" id="maps-planner-help">
      {mouse && <dl>
        <dt>Мышь и клавиатура</dt>
        <dd><kbd>ЛКМ</kbd> рисовать выбранным инструментом</dd>
        <dd><kbd>ПКМ</kbd> или <kbd>колесо</kbd> зажать — двигать карту</dd>
        <dd><kbd>колесо</kbd> масштаб</dd>
        <dd><kbd>Shift</kbd> линия по 8 направлениям</dd>
        <dd><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> отменить / повторить</dd>
        <dd><kbd>Delete</kbd> удалить выделенное, <kbd>Esc</kbd> снять выделение</dd>
      </dl>}
      {touch && <dl>
        <dt>Сенсорный экран</dt>
        <dd><kbd>1 палец</kbd> рисовать</dd>
        <dd><kbd>2 пальца</kbd> двигать и масштабировать карту</dd>
        <dd>Выделенное удаляется кнопкой «Удалить» в панели</dd>
      </dl>}
      <p>Значок или зона, поставленные на то же место тем же типом, убираются. План сохраняется кодом, ссылкой или в «Моих планах».</p>
    </div>
  );
}

function StampIcon({ stamp, color }: { stamp: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 26 * dpr;
    canvas.height = 26 * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, 26, 26);
    drawStamp(context, stamp, color, 13, 13, 11);
  }, [color, stamp]);
  return <canvas ref={ref} width={26} height={26} aria-hidden="true" />;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  planner: Planner;
  mapId: string;
  mapName: (mapId: string) => string | undefined;
  zones: DecodedPlan["zones"];
  zoneTemplates: ZoneTemplate[];
  zonesError?: string;
  /** A code made for another map: switch to that map and import it there. */
  onOpenOnMap: (mapId: string, code: string) => void;
};

export function PlannerPanel({ planner, mapId, mapName, zones, zoneTemplates, zonesError, onOpenOnMap }: Props) {
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<DecodedPlan>();
  const [planName, setPlanName] = useState("");
  const [saved, setSaved] = useState<SavedPlan[]>(() => loadSavedPlans());
  const [sharedCode, setSharedCode] = useState<string>();
  // Open on the first visit; afterwards it stays one tap away.
  const [helpOpen, setHelpOpen] = useState(() => !helpSeen());
  const toggleHelp = () => {
    if (helpOpen) markHelpSeen();
    setHelpOpen(!helpOpen);
  };
  const labelInput = useRef<HTMLInputElement>(null);
  const { tool, labelEditor } = planner;
  const drawsLines = tool === "brush" || tool === "line" || tool === "arrow" || tool === "select";
  const colored = tool !== "pan" && tool !== "zone" && tool !== "eraser";
  const mapPlans = saved.filter((plan) => plan.mapId === mapId);

  useEffect(() => {
    if (labelEditor) labelInput.current?.focus();
  }, [labelEditor]);

  const currentPlan = (): DecodedPlan => ({ mapId, elements: planner.elements, zones });

  const share = async (kind: "code" | "link") => {
    try {
      const code = await encodePlan(currentPlan());
      const text = kind === "code" ? code : `${location.origin}${location.pathname}#/module/maps?map=${encodeURIComponent(mapId)}&plan=${code}`;
      setSharedCode(text);
      const copied = await copyText(text);
      setStatus({ text: copied ? (kind === "code" ? "Код плана скопирован." : "Ссылка на план скопирована.") : "Скопируйте вручную из поля ниже." });
    } catch {
      setStatus({ text: "Не удалось создать код плана.", error: true });
    }
  };

  const checkPasted = async (value: string) => {
    setPasted(value);
    setPreview(undefined);
    if (!value.trim()) { setStatus(undefined); return; }
    try {
      const decoded = await decodePlan(value);
      setPreview(decoded);
      setStatus(undefined);
    } catch (error) {
      setStatus({ text: error instanceof PlanCodeError ? error.message : "Код плана повреждён.", error: true });
    }
  };

  const applyPasted = (mode: "replace" | "merge") => {
    if (!preview) return;
    if (preview.mapId !== mapId) {
      onOpenOnMap(preview.mapId, pasted.replace(/\s+/g, ""));
    } else {
      planner.loadPlan(preview, mode);
      setStatus({ text: mode === "replace" ? "План загружен." : "План добавлен к текущему." });
    }
    setPasteOpen(false);
    setPasted("");
    setPreview(undefined);
  };

  const savePlan = async () => {
    const name = planName.trim().slice(0, 40);
    if (!name) { setStatus({ text: "Введите название плана.", error: true }); return; }
    const code = await encodePlan(currentPlan());
    const next = storeSavedPlan(saved, { name, mapId, code });
    if (!next) { setStatus({ text: "Не удалось сохранить: место в браузере закончилось или планов слишком много.", error: true }); return; }
    setSaved(next);
    setPlanName("");
    setStatus({ text: `План «${name}» сохранён в этом браузере.` });
  };

  const openSaved = async (plan: SavedPlan) => {
    try {
      planner.loadPlan(await decodePlan(plan.code), "replace");
      setStatus({ text: `Открыт план «${plan.name}».` });
    } catch (error) {
      setStatus({ text: error instanceof PlanCodeError ? error.message : "План повреждён.", error: true });
    }
  };

  const summary = (plan: DecodedPlan) => {
    const counts = new Map<keyof typeof NOUNS, number>();
    for (const element of plan.elements) counts.set(element.kind, (counts.get(element.kind) ?? 0) + 1);
    if (plan.zones.length) counts.set("zone", plan.zones.length);
    const parts = [...counts].map(([kind, count]) => `${count} ${plural(count, NOUNS[kind])}`);
    return `${mapName(plan.mapId) ?? plan.mapId}: ${parts.length ? parts.join(", ") : "пустой план"}`;
  };

  return (
    <section className="maps-planner" aria-label="Планировщик">
      <div className="maps-planner-heading">
        <strong>Планировщик</strong>
        <button type="button" aria-expanded={helpOpen} aria-controls="maps-planner-help" title="Управление" onClick={toggleHelp}>
          {helpOpen ? "Скрыть подсказку" : "? Управление"}
        </button>
      </div>
      {helpOpen && <ControlsHelp />}
      <div className="maps-planner-tools" role="toolbar" aria-label="Инструменты">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tool === item.id ? "is-active" : undefined}
            aria-pressed={tool === item.id}
            title={item.hint}
            onClick={() => planner.setTool(item.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[item.id]}</svg>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="maps-planner-hint">{TOOLS.find((item) => item.id === tool)?.hint}.</p>

      {colored && (
        <div className="maps-planner-colors" role="radiogroup" aria-label="Цвет">
          {PLAN_COLORS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={planner.color === item.id}
              aria-label={item.name}
              title={item.name}
              className={planner.color === item.id ? "is-active" : undefined}
              style={{ backgroundColor: item.value }}
              onClick={() => planner.setColor(item.id)}
            />
          ))}
        </div>
      )}
      {drawsLines && (
        <label className="maps-planner-range">
          <span>Толщина: {planner.width}</span>
          <input type="range" min={MIN_WIDTH} max={MAX_WIDTH} step={1} value={planner.width} onChange={(event) => planner.setWidth(Number(event.target.value))} />
        </label>
      )}
      {(tool === "line" || tool === "arrow") && (
        <label className="maps-planner-check">
          <input type="checkbox" checked={planner.snapAngles} onChange={(event) => planner.setSnapAngles(event.target.checked)} />
          <span>Привязка к 8 направлениям, как в игре (Shift — наоборот)</span>
        </label>
      )}
      {tool === "area" && (
        <label className="maps-planner-check">
          <input type="checkbox" checked={planner.filled} onChange={(event) => planner.setFilled(event.target.checked)} />
          <span>С заливкой</span>
        </label>
      )}
      {tool === "stamp" && (
        <div className="maps-planner-stamps" role="radiogroup" aria-label="Значок">
          {STAMPS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={planner.stamp === item.id}
              className={planner.stamp === item.id ? "is-active" : undefined}
              onClick={() => planner.setStamp(item.id)}
            >
              <StampIcon stamp={item.id} color={planner.color === 0 ? "#e8ece9" : PLAN_COLORS[planner.color].value} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}
      {tool === "zone" && (zonesError
        ? <p className="maps-planner-hint">Зоны огня недоступны: {zonesError}</p>
        : (
          <div className="maps-zones-palette" role="radiogroup" aria-label="Тип зоны">
            {zoneTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={planner.zoneTemplateId === template.id}
                className={planner.zoneTemplateId === template.id ? "is-active" : undefined}
                title={[template.title, ...template.details].join("\n")}
                onClick={() => planner.setZoneTemplateId(planner.zoneTemplateId === template.id ? undefined : template.id)}
              >
                <i style={{ borderColor: template.color, backgroundColor: template.shapes[0].fill }} aria-hidden="true" />
                <span><strong>{template.label}</strong><small>{template.details[0]}</small></span>
              </button>
            ))}
            <p className="maps-planner-hint">Зон на карте: {zones.length} / {MAX_ZONES}</p>
          </div>
        ))}

      {labelEditor && (
        <form className="maps-planner-label" onSubmit={(event) => { event.preventDefault(); planner.commitLabel(); }}>
          <label>
            <span>{labelEditor.index === undefined ? "Новая метка" : "Изменить метку"} · {(labelEditor.at.x / UNITS_PER_TILE).toFixed(1)}, {(labelEditor.at.y / UNITS_PER_TILE).toFixed(1)}</span>
            <input
              ref={labelInput}
              value={labelEditor.text}
              maxLength={MAX_LABEL_LENGTH}
              placeholder="Например: ФОБ, держим мост"
              onChange={(event) => planner.setLabelEditor({ ...labelEditor, text: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Escape") planner.setLabelEditor(undefined); }}
            />
          </label>
          <div>
            <button type="submit">Готово</button>
            {labelEditor.index !== undefined && <button type="button" onClick={planner.removeLabel}>Удалить</button>}
            <button type="button" onClick={() => planner.setLabelEditor(undefined)}>Отмена</button>
          </div>
        </form>
      )}

      {planner.selected !== undefined && (
        <div className="maps-planner-row">
          <span>Выделен элемент · цвет и толщина меняют его</span>
          <button type="button" onClick={planner.removeSelected}>Удалить</button>
        </div>
      )}

      <div className="maps-planner-row maps-planner-history">
        <button type="button" disabled={!planner.canUndo} onClick={() => planner.dispatch({ type: "undo" })} title="Ctrl+Z">Отменить</button>
        <button type="button" disabled={!planner.canRedo} onClick={() => planner.dispatch({ type: "redo" })} title="Ctrl+Y">Повторить</button>
        <button
          type="button"
          disabled={!planner.elements.length}
          onClick={() => { if (window.confirm("Очистить все рисунки, метки и значки? Это можно отменить.")) planner.dispatch({ type: "clear" }); }}
        >
          Очистить
        </button>
        <output>{planner.elements.length} / {MAX_ELEMENTS}</output>
      </div>

      <details className="maps-planner-share" open>
        <summary>План: код, ссылка, мои планы</summary>
        <div className="maps-planner-row">
          <button type="button" onClick={() => share("code")}>Копировать код</button>
          <button type="button" onClick={() => share("link")}>Ссылка</button>
          <button type="button" onClick={() => { setPasteOpen((value) => !value); setStatus(undefined); }}>Вставить код</button>
        </div>
        {sharedCode && <textarea className="maps-planner-code" readOnly value={sharedCode} rows={3} onFocus={(event) => event.currentTarget.select()} />}
        {pasteOpen && (
          <div className="maps-planner-paste">
            <textarea
              className="maps-planner-code"
              rows={3}
              placeholder="SSMC1.…"
              value={pasted}
              onChange={(event) => checkPasted(event.target.value)}
              autoFocus
            />
            {preview && (
              <>
                <p className="maps-planner-hint">{summary(preview)}</p>
                {preview.mapId === mapId ? (
                  <div className="maps-planner-row">
                    <button type="button" onClick={() => applyPasted("replace")}>Заменить текущий</button>
                    <button type="button" onClick={() => applyPasted("merge")}>Добавить к текущему</button>
                  </div>
                ) : (
                  <div className="maps-planner-row">
                    <button type="button" onClick={() => applyPasted("replace")}>Открыть на карте «{mapName(preview.mapId) ?? preview.mapId}»</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <form className="maps-planner-save" onSubmit={(event) => { event.preventDefault(); savePlan(); }}>
          <input value={planName} maxLength={40} placeholder="Название плана" onChange={(event) => setPlanName(event.target.value)} />
          <button type="submit">Сохранить</button>
        </form>
        {mapPlans.length > 0 && (
          <ul className="maps-planner-saved">
            {mapPlans.map((plan) => (
              <li key={plan.id}>
                <button type="button" className="maps-planner-saved-open" onClick={() => openSaved(plan)} title="Открыть — заменит текущий план">
                  <strong>{plan.name}</strong>
                  <small>{new Date(plan.savedAt).toLocaleString("ru")}</small>
                </button>
                <button type="button" aria-label={`Удалить план ${plan.name}`} onClick={() => setSaved(deleteSavedPlan(saved, plan.id))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </details>
      {status && <p className={status.error ? "maps-planner-status is-error" : "maps-planner-status"} role="status">{status.text}</p>}
    </section>
  );
}
