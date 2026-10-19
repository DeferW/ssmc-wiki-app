import { describe, expect, it } from "vitest";
import changelogSource from "../../CHANGELOG.md?raw";
import { parseChangelog, pendingRelease } from "./changelog";

describe("changelog", () => {
  it("splits releases, joins wrapped items and keeps the unreleased section", () => {
    const entries = parseChangelog([
      "# Изменения",
      "",
      "Правила нумерации.",
      "",
      "## Не выпущено",
      "",
      "- Карты: заливка",
      "",
      "## 3.1.0 — 2026-09-15",
      "",
      "Первая версия,",
      "записанная в файл.",
      "",
      "- Данные: снимок",
      "  из соседнего репозитория.",
      "- Карты: тайлы.",
      "",
      "## 3.0.0 — 2026-09-04",
      "",
    ].join("\r\n"));

    expect(entries).toEqual([
      { intro: "", items: ["Карты: заливка"] },
      {
        version: "3.1.0",
        date: "2026-09-15",
        intro: "Первая версия, записанная в файл.",
        items: ["Данные: снимок из соседнего репозитория.", "Карты: тайлы."],
      },
    ]);
  });

  it("reads the repository changelog with the current package version", () => {
    const released = parseChangelog(changelogSource).filter((entry) => entry.version);
    expect(released[0]?.version).toBe(__APP_VERSION__);
    expect(released.every((entry) => entry.date)).toBe(true);
  });

  it("builds the unreleased entry from change notes and skips the README", () => {
    const note = (bump: string, text: string) => `---\nbump: ${bump}\n---\n${text}\n`;
    expect(pendingRelease({ "../../.changes/README.md": "Формат." }, "3.1.0")).toBeUndefined();
    expect(pendingRelease({
      "../../.changes/fix.md": note("patch", "Фикс."),
      "../../.changes/roof.md": note("minor", "Крыши."),
    }, "3.1.0")).toEqual({ nextVersion: "3.2.0", intro: "", items: ["Крыши.", "Фикс."] });
    expect(() => pendingRelease({ "../../.changes/bad.md": note("big", "Фикс.") }, "3.1.0")).toThrow("bad.md");
  });
});
