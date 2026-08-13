import { CATEGORY_ORDER, HIDDEN_CATEGORY } from "../config";

export function FilterPanel({ categories, counts, selected, open, includeHidden = false, onSelect, onOpen, onClose, onReset }: {
  categories: string[];
  counts: Map<string, number>;
  selected: string[];
  open: boolean;
  includeHidden?: boolean;
  onSelect: (category: string) => void;
  onOpen: (category: string) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const ordered = CATEGORY_ORDER.filter((category) => (includeHidden || category !== HIDDEN_CATEGORY) && categories.includes(category));
  return (
    <>
      {open && <button className="filter-backdrop" type="button" aria-label="Закрыть разделы" onClick={onClose} />}
      <aside className={`filter-sidebar${open ? " is-open" : ""}`} aria-label="Разделы каталога">
        <header>
          <div><span>CATALOG INDEX</span><strong>Разделы</strong></div>
          <button type="button" onClick={onClose} aria-label="Закрыть разделы">×</button>
        </header>
        <div className="category-list">
          {ordered.map((category) => {
            const isSelected = selected.includes(category);
            return (
              <div className={`category-row${isSelected ? " is-selected" : ""}`} key={category}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelect(category)}
                  aria-label={`Добавить раздел «${category}» к фильтру`}
                />
                <button type="button" onClick={() => onOpen(category)}>
                  <span>{category}</span>
                  <small>{counts.get(category) ?? 0}</small>
                </button>
              </div>
            );
          })}
        </div>
        <button className="reset-filters" type="button" onClick={onReset} disabled={!selected.length}>Сбросить разделы</button>
      </aside>
    </>
  );
}
