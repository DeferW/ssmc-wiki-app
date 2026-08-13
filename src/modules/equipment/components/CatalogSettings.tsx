import { useEffect, useRef, useState } from "react";
import type { PanelPosition } from "../types";

export function CatalogSettings({ position, onPositionChange }: {
  position: PanelPosition;
  onPositionChange: (position: PanelPosition) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="catalog-settings" ref={root}>
      <button type="button" className="cfg-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        [ CFG ]
      </button>
      {open && (
        <section className="settings-popover" aria-label="Настройки каталога">
          <header><strong>Настройки каталога</strong><button type="button" onClick={() => setOpen(false)}>×</button></header>
          <fieldset>
            <legend>Карточка предмета</legend>
            <label>
              <input type="radio" checked={position === "right"} onChange={() => onPositionChange("right")} />
              <span><b>Сбоку</b><small>Стандартный режим</small></span>
            </label>
            <label>
              <input type="radio" checked={position === "center"} onChange={() => onPositionChange("center")} />
              <span><b>По центру</b><small>Компактное окно</small></span>
            </label>
          </fieldset>
          <p>На телефоне карточка всегда занимает весь экран.</p>
        </section>
      )}
    </div>
  );
}
