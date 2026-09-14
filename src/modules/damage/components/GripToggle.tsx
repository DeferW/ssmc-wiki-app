export function GripToggle({ wielded, onChange }: { wielded: boolean; onChange: (value: boolean) => void }) {
  const hand = <path d="M7 20 3 13q-1-2 1-2l3 3V5q0-2 2-2t2 2v5-6q0-2 2-2t2 2v6-4q0-2 2-2t2 2v7q0 5-4 7Z" />;
  return <div className="grip-toggle" role="group" aria-label="Хват оружия">
    {[false, true].map((value) => <button type="button" key={String(value)} aria-label={value ? "Две руки" : "Одна рука"}
      title={value ? "Две руки" : "Одна рука"} aria-pressed={wielded === value} onClick={() => onChange(value)}>
      <svg viewBox={value ? "0 0 44 24" : "0 0 24 24"} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        {hand}{value && <g transform="translate(22 0)">{hand}</g>}
      </svg>
    </button>)}
  </div>;
}
