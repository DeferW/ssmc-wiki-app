// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activatedModules, addRelease, nextVersion, parseChange, releaseBump } from "./changes.mjs";
import { checkPullRequest } from "./check-changes.mjs";
import { release } from "./release.mjs";

const note = (bump, text) => `---\nbump: ${bump}\n---\n${text}\n`;
const registry = (status) => `const modules = [\n  { id: "maps", status: "active" },\n  { id: "explosions", path: "/x", status: "${status}" },\n];\n`;

describe("change notes", () => {
  it("reads the bump and joins wrapped text", () => {
    expect(parseChange("---\r\nbump: minor\r\n---\r\nКарты: уровни\r\n  крыши.\r\n", "roof.md"))
      .toEqual({ name: "roof.md", bump: "minor", text: "Карты: уровни крыши." });
  });

  it("rejects notes the release could misread", () => {
    expect(() => parseChange("Карты", "a.md")).toThrow("нет блока");
    expect(() => parseChange(note("feature", "Карты"), "a.md")).toThrow("bump должен быть");
    expect(() => parseChange("---\nbump: patch\ntype: fix\n---\nКарты\n", "a.md")).toThrow("неизвестные поля");
    expect(() => parseChange(note("patch", ""), "a.md")).toThrow("нет текста");
  });

  it("takes the largest bump and resets lower numbers", () => {
    expect(releaseBump([{ bump: "patch" }, { bump: "minor" }])).toBe("minor");
    expect(releaseBump([])).toBeUndefined();
    expect(nextVersion("3.1.4", "patch")).toBe("3.1.5");
    expect(nextVersion("3.1.4", "minor")).toBe("3.2.0");
    expect(nextVersion("3.1.4", "major")).toBe("4.0.0");
  });

  it("adds the release above the newest section, larger changes first", () => {
    const changelog = "# Изменения\n\nВступление.\n\n## 3.1.0 — 2026-09-15\n\n- Старое.\n";
    const changes = [{ name: "b.md", bump: "patch", text: "Фикс." }, { name: "a.md", bump: "minor", text: "Фича." }];
    expect(addRelease(changelog, "3.2.0", "2026-10-04", changes)).toBe(
      "# Изменения\n\nВступление.\n\n## 3.2.0 — 2026-10-04\n\n- Фича.\n- Фикс.\n\n## 3.1.0 — 2026-09-15\n\n- Старое.\n",
    );
  });
});

describe("pull request check", () => {
  it("requires a major note when a planned module becomes active", () => {
    const input = { changedFiles: ["src/modules/registry.tsx"], registryBefore: registry("planned"), registryAfter: registry("active") };
    expect(activatedModules(input.registryBefore, input.registryAfter)).toEqual(["explosions"]);
    expect(checkPullRequest({ ...input, addedNotes: { "boom.md": note("minor", "Взрывы") } }).errors).toHaveLength(1);
    expect(checkPullRequest({ ...input, addedNotes: { "boom.md": note("major", "Взрывы") } }).errors).toEqual([]);
  });

  it("only warns about site code without a note", () => {
    const base = { addedNotes: {}, registryBefore: registry("planned"), registryAfter: registry("planned") };
    expect(checkPullRequest({ ...base, changedFiles: ["src/pages/HomePage.tsx"] })).toMatchObject({ errors: [], warnings: [expect.any(String)] });
    expect(checkPullRequest({ ...base, changedFiles: ["src/pages/changelog.test.ts", "docs/ROADMAP.md"] }).warnings).toEqual([]);
  });

  it("parses the real registry", async () => {
    const source = await readFile(resolve(import.meta.dirname, "../src/modules/registry.tsx"), "utf8");
    expect(activatedModules(source, source)).toEqual([]);
    expect(activatedModules("", source)).toContain("maps");
  });
});

describe("release", () => {
  const roots = [];
  afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

  async function project(notes) {
    const root = await mkdtemp(resolve(tmpdir(), "ssmc-release-test-"));
    roots.push(root);
    await mkdir(resolve(root, ".changes"));
    await writeFile(resolve(root, ".changes/README.md"), "Формат отметок.");
    for (const [name, source] of Object.entries(notes)) await writeFile(resolve(root, ".changes", name), source);
    await writeFile(resolve(root, "package.json"), `${JSON.stringify({ name: "app", version: "3.1.0" }, null, 2)}\n`);
    await writeFile(resolve(root, "package-lock.json"), `${JSON.stringify({ name: "app", version: "3.1.0", packages: { "": { version: "3.1.0" } } }, null, 2)}\n`);
    await writeFile(resolve(root, "CHANGELOG.md"), "# Изменения\n\n## 3.1.0 — 2026-09-15\n\n- Старое.\n");
    return root;
  }

  it("bumps versions, writes the changelog and removes used notes", async () => {
    const root = await project({ "roof.md": note("minor", "Крыши."), "fix.md": note("patch", "Фикс.") });
    const result = await release(root, { now: new Date(2026, 9, 4) });

    expect(result).toMatchObject({ from: "3.1.0", to: "3.2.0", bump: "minor" });
    expect(JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version).toBe("3.2.0");
    const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
    expect([lock.version, lock.packages[""].version]).toEqual(["3.2.0", "3.2.0"]);
    expect(await readFile(resolve(root, "CHANGELOG.md"), "utf8")).toContain("## 3.2.0 — 2026-10-04\n\n- Крыши.\n- Фикс.\n\n## 3.1.0");
    expect(await readdir(resolve(root, ".changes"))).toEqual(["README.md"]);
  });

  it("does nothing without notes or on a dry run", async () => {
    expect(await release(await project({}))).toBeUndefined();
    const root = await project({ "boom.md": note("major", "Взрывы.") });
    expect((await release(root, { dryRun: true }))?.to).toBe("4.0.0");
    expect(JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version).toBe("3.1.0");
  });
});
