import type { CatalogItem } from "../../equipment/types";
import { availableGrips } from "../grip";
export function GripToggle({ weapon, wielded, onChange }: { weapon: CatalogItem | null; wielded: boolean; onChange: (value: boolean) => void }) {
  const allowed = availableGrips(weapon);
  return <div className="grip-toggle" role="group" aria-label="Хват оружия">
    {[false, true].map((value) => <button type="button" key={String(value)} aria-label={value ? "Две руки" : "Одна рука"}
      disabled={value ? !allowed.two : !allowed.one}
      title={value ? (allowed.two ? "Стрельба в двух руках" : "Оружие нельзя взять в две руки") : (allowed.one ? "Стрельба в одной руке" : "Для стрельбы нужны две руки")} aria-pressed={wielded === value} onClick={() => onChange(value)}>
      <svg viewBox="0 0 32 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20v-3l-3-5a1.5 1.5 0 0 1 2-2l2 2V5a1.5 1.5 0 0 1 3 0v5h4a2 2 0 0 1 2 2v4l-2 4Z" />
        {value && <path d="M7 20v-3l-3-5a1.5 1.5 0 0 1 2-2M8 7V5a1.5 1.5 0 0 1 3 0" />}
        <path d={value ? "M25 8h3l-3 6h3" : "M25 9l2-1v6"} />
      </svg>
    </button>)}
  </div>;
}
