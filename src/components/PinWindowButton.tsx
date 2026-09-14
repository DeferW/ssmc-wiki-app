import { useEffect, useRef, useState } from "react";

type PictureInPictureWindow = Window & {
  documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> };
};

export function PinWindowButton() {
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const popup = useRef<Window | null>(null);
  const mounted = useRef(true);
  const embedded = window.frameElement?.getAttribute("data-ssmc-pinned") === "true";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      popup.current?.close();
      popup.current = null;
    };
  }, []);

  const toggle = async () => {
    setError("");
    if (embedded) {
      window.top?.close();
      return;
    }
    if (popup.current && !popup.current.closed) {
      popup.current.close();
      return;
    }
    const api = (window as PictureInPictureWindow).documentPictureInPicture;
    if (!api) {
      setError("Этот браузер не поддерживает окно сайта поверх других окон. Попробуйте обновить браузер или открыть сайт в браузере с поддержкой этой функции.");
      return;
    }
    setBusy(true);
    let target: Window | undefined;
    try {
      target = await api.requestWindow({ width: 720, height: 640 });
      if (!mounted.current) { target.close(); return; }
      popup.current = target;
      target.addEventListener("pagehide", () => {
        if (popup.current !== target) return;
        popup.current = null;
        if (mounted.current) setPinned(false);
      }, { once: true });
      target.document.title = "SSMC Tactical Database";
      target.document.documentElement.lang = "ru";
      target.document.body.style.cssText = "margin:0;background:#030604;overflow:hidden";
      // A same-origin frame gives every module its own viewport, routing and
      // document events, including map canvas resizing and keyboard controls.
      const frame = target.document.createElement("iframe");
      frame.title = "SSMC Tactical Database — поверх окон";
      frame.setAttribute("data-ssmc-pinned", "true");
      frame.style.cssText = "display:block;width:100vw;height:100vh;border:0;color-scheme:dark";
      frame.src = window.location.href;
      target.document.body.replaceChildren(frame);
      setPinned(true);
    } catch {
      target?.close();
      popup.current = null;
      if (mounted.current) setError("Не удалось закрепить окно. Проверьте разрешения браузера и попробуйте ещё раз.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const label = embedded || pinned ? "Открепить окно" : "Закрепить поверх окон";
  return (
    <div className="pin-window" onKeyDown={(event) => { if (event.key === "Escape") setError(""); }}>
      <button className="pin-window-button" type="button" onClick={() => void toggle()}
        aria-label={label} title={label} aria-pressed={embedded || pinned} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m16 3 5 5-3 1-4 4 1 4-2 2-8-8 2-2 4 1 4-4 1-3Z" />
          <path d="m9 15-6 6" />
        </svg>
      </button>
      {error && <div className="pin-window-message" role="status">
        <p>{error}</p>
        <button type="button" onClick={() => setError("")}>Понятно</button>
      </div>}
    </div>
  );
}
