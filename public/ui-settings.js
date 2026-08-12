(() => {
  "use strict";

  const STORAGE_KEY = "ssmc-ui-settings-v1";
  const DEFAULT_POSITION = "center";
  const allowedPositions = new Set(["center", "right"]);

  const body = document.body;
  const toggle = document.getElementById("ui-settings-toggle");
  const panel = document.getElementById("ui-settings-panel");
  const closeButton = document.getElementById("ui-settings-close");
  const positionInputs = Array.from(
    document.querySelectorAll('input[name="item-panel-position"]')
  );

  if (!body || !toggle || !panel || !closeButton || !positionInputs.length) return;

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const itemPanelPosition = allowedPositions.has(parsed.itemPanelPosition)
        ? parsed.itemPanelPosition
        : DEFAULT_POSITION;
      return { itemPanelPosition };
    } catch {
      return { itemPanelPosition: DEFAULT_POSITION };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private/locked storage: the setting still works for the current page.
    }
  }

  function applySettings(settings) {
    body.dataset.itemPanel = settings.itemPanelPosition;
    for (const input of positionInputs) {
      input.checked = input.value === settings.itemPanelPosition;
    }
  }

  function setPanelOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      const checked = positionInputs.find((input) => input.checked);
      (checked || closeButton).focus({ preventScroll: true });
    }
  }

  let settings = readSettings();
  applySettings(settings);

  toggle.addEventListener("click", () => {
    setPanelOpen(panel.hidden);
  });

  closeButton.addEventListener("click", () => {
    setPanelOpen(false);
    toggle.focus({ preventScroll: true });
  });

  for (const input of positionInputs) {
    input.addEventListener("change", () => {
      if (!input.checked || !allowedPositions.has(input.value)) return;
      settings = { ...settings, itemPanelPosition: input.value };
      applySettings(settings);
      saveSettings(settings);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.stopPropagation();
      setPanelOpen(false);
      toggle.focus({ preventScroll: true });
    }
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (panel.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panel.contains(target) || toggle.contains(target)) return;
    setPanelOpen(false);
  });
})();
