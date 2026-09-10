import { beforeEach } from "vitest";

// Browser storage belongs to jsdom. Node 25+ also exposes a native global with
// different semantics; using it makes browser tests depend on the host runtime.
const environment = globalThis as typeof globalThis & { jsdom?: { window: Window } };
if (environment.jsdom) {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value: environment.jsdom.window[name], writable: true });
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
}
beforeEach(() => {
  environment.jsdom?.window.localStorage.clear();
  environment.jsdom?.window.sessionStorage.clear();
});
