import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { activatedModules, parseChange } from "./changes.mjs";
import { readChanges } from "./release.mjs";

const REGISTRY = "src/modules/registry.tsx";

/**
 * Rules for a pull request compared with its base:
 * - every note in .changes/ must parse (always an error);
 * - a module that became active needs a new `major` note (error);
 * - user-facing code under src/ without a new note gets a warning only, since
 *   refactoring and tests do not change the version.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkPullRequest({ changedFiles, addedNotes, registryBefore, registryAfter }) {
  const errors = [];
  const warnings = [];
  const notes = [];
  for (const [name, source] of Object.entries(addedNotes)) {
    try { notes.push(parseChange(source, name)); }
    catch (error) { errors.push(error.message); }
  }
  const activated = registryBefore === undefined ? [] : activatedModules(registryBefore, registryAfter);
  if (activated.length && !notes.some((note) => note.bump === "major")) {
    errors.push(`Модуль стал активным (${activated.join(", ")}) — нужна отметка в .changes/ с bump: major.`);
  }
  const userCode = changedFiles.filter((file) => file.startsWith("src/") && !/\.test\.[jt]sx?$/.test(file) && !file.startsWith("src/test/"));
  if (userCode.length && !notes.length) {
    warnings.push("Код сайта изменён, но в .changes/ нет новой отметки. Если изменение заметно пользователю — добавьте её (см. docs/VERSIONING.md).");
  }
  return { errors, warnings };
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fileAt(root, ref, path) {
  try { return git(root, "show", `${ref}:${path}`); } catch { return undefined; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const baseIndex = process.argv.indexOf("--base");
  // Validates every pending note even without a base, e.g. locally.
  await readChanges(root);
  if (baseIndex < 0) {
    console.log("Отметки в .changes/ в порядке.");
  } else {
    const base = git(root, "merge-base", process.argv[baseIndex + 1], "HEAD").trim();
    const changedFiles = git(root, "diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
    const added = git(root, "diff", "--name-only", "--diff-filter=A", base, "HEAD", "--", ".changes/").split("\n")
      .filter((file) => file.endsWith(".md") && !file.endsWith("README.md"));
    const addedNotes = Object.fromEntries(await Promise.all(added.map(async (file) => [file, await readFile(resolve(root, file), "utf8")])));
    const { errors, warnings } = checkPullRequest({
      changedFiles,
      addedNotes,
      registryBefore: fileAt(root, base, REGISTRY),
      registryAfter: await readFile(resolve(root, REGISTRY), "utf8"),
    });
    for (const warning of warnings) console.log(`::warning::${warning}`);
    for (const error of errors) console.log(`::error::${error}`);
    if (errors.length) process.exit(1);
    console.log(`Отметки в порядке; новых в PR: ${added.length}.`);
  }
}
