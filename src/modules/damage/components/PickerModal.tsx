import { useEffect } from "react";
import type { ReactNode } from "react";

export function PickerModal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="picker-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="picker-header">
          <strong>{title}</strong>
          <button type="button" className="picker-close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="picker-body">{children}</div>
      </div>
    </div>
  );
}
