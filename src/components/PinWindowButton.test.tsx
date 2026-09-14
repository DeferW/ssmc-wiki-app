import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PinWindowButton } from "./PinWindowButton";

let container: HTMLDivElement;
let root: Root;
let original: PropertyDescriptor | undefined;
beforeEach(async () => {
  original = Object.getOwnPropertyDescriptor(window, "documentPictureInPicture");
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<PinWindowButton />));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  if (original) Object.defineProperty(window, "documentPictureInPicture", original);
  else Reflect.deleteProperty(window, "documentPictureInPicture");
});
function api(value: unknown) { Object.defineProperty(window, "documentPictureInPicture", { configurable: true, value }); }
async function click() { await act(async () => container.querySelector("button")!.click()); }
function targetWindow() {
  const target = new EventTarget();
  return Object.assign(target, { document: document.implementation.createHTMLDocument(), closed: false,
    close: vi.fn(() => { target.dispatchEvent(new Event("pagehide")); }),
  });
}
it("explains unsupported browsers without pretending to pin a normal popup", async () => {
  api(undefined); await click();
  expect(container.querySelector('[role="status"]')?.textContent).toContain("не поддерживает");
  expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("false");
});
it("recovers after a rejected request", async () => {
  api({ requestWindow: vi.fn().mockRejectedValue(new Error("denied")) }); await click();
  expect(container.textContent).toContain("Не удалось закрепить");
  expect(container.querySelector("button")!.disabled).toBe(false);
});
it("opens the current URL and resets the button when the window closes", async () => {
  const target = targetWindow(); const requestWindow = vi.fn().mockResolvedValue(target);
  api({ requestWindow }); await click();
  expect(requestWindow).toHaveBeenCalledTimes(1);
  expect(target.document.querySelector("iframe")?.src).toBe(window.location.href);
  expect(target.document.querySelector("iframe")?.dataset.ssmcPinned).toBe("true");
  expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
  await act(async () => target.dispatchEvent(new Event("pagehide")));
  expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("false");
});
it("closes its window on a second click and when unmounted", async () => {
  const target = targetWindow(); api({ requestWindow: vi.fn().mockResolvedValue(target) });
  await click(); await click(); expect(target.close).toHaveBeenCalledTimes(1);
  await click(); await act(async () => root.render(null)); expect(target.close).toHaveBeenCalledTimes(2);
});
