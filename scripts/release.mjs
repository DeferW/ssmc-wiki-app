import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { addRelease, nextVersion, parseChange, releaseBump, sortChanges } from "./changes.mjs";

const NOTES_DIRECTORY = ".changes";

/** Change notes in .changes/, validated; README.md explains the format and is skipped. */
export async function readChanges(root) {
  const directory = resolve(root, NOTES_DIRECTORY);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".md") && name !== "README.md").sort();
  return Promise.all(names.map(async (name) => parseChange(await readFile(resolve(directory, name), "utf8"), name)));
}

function localDate(now) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function writeJson(path, update) {
  const value = JSON.parse(await readFile(path, "utf8"));
  update(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Turns pending notes into a release: bumps package.json and package-lock.json,
 * adds a CHANGELOG.md section and deletes the used notes.
 * @returns {Promise<{ from: string, to: string, bump: string, changes: object[] } | undefined>}
 */
export async function release(root, { dryRun = false, now = new Date() } = {}) {
  const changes = await readChanges(root);
  const bump = releaseBump(changes);
  if (!bump) return undefined;

  const packagePath = resolve(root, "package.json");
  const from = JSON.parse(await readFile(packagePath, "utf8")).version;
  const to = nextVersion(from, bump);
  const result = { from, to, bump, changes: sortChanges(changes) };
  if (dryRun) return result;

  const changelogPath = resolve(root, "CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  await writeFile(changelogPath, addRelease(changelog, to, localDate(now), changes));
  await writeJson(packagePath, (value) => { value.version = to; });
  await writeJson(resolve(root, "package-lock.json"), (value) => {
    value.version = to;
    if (value.packages?.[""]) value.packages[""].version = to;
  });
  for (const change of changes) await rm(resolve(root, NOTES_DIRECTORY, change.name));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dryRun = process.argv.includes("--dry-run");
  const result = await release(resolve(import.meta.dirname, ".."), { dryRun });
  if (!result) {
    console.log("В .changes/ нет отметок — выпускать нечего.");
  } else {
    console.log(`${result.from} → ${result.to} (${result.bump})`);
    for (const change of result.changes) console.log(`  ${change.bump.padEnd(5)} ${change.text}`);
    console.log(dryRun
      ? "Пробный запуск: файлы не изменены."
      : `Готово: package.json, package-lock.json и CHANGELOG.md обновлены, отметки удалены. После merge: git tag v${result.to} && git push origin v${result.to}`);
  }
}
