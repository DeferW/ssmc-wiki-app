// Pure helpers for .changes/*.md notes. No Node APIs: the project page bundles
// this file to show unreleased notes, and the release scripts reuse it.

/** Ordered from the largest change to the smallest. */
export const BUMPS = ["major", "minor", "patch"];

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parses one change note:
 *
 *   ---
 *   bump: minor
 *   ---
 *   Карты: текст для журнала изменений.
 *
 * @param {string} source
 * @param {string} name file name, used in error messages
 * @returns {{ name: string, bump: "major" | "minor" | "patch", text: string }}
 */
export function parseChange(source, name) {
  const match = FRONT_MATTER.exec(source.replace(/^﻿/, ""));
  if (!match) throw new Error(`${name}: нет блока --- bump: ... --- в начале файла`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const field = /^(\w+):\s*(.*?)\s*$/.exec(line);
    if (!field) throw new Error(`${name}: непонятная строка «${line}»`);
    fields[field[1]] = field[2];
  }
  const unknown = Object.keys(fields).filter((key) => key !== "bump");
  if (unknown.length) throw new Error(`${name}: неизвестные поля ${unknown.join(", ")}`);
  if (!BUMPS.includes(fields.bump)) throw new Error(`${name}: bump должен быть одним из ${BUMPS.join(", ")}`);
  const text = match[2].split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(" ").replace(/^- /, "");
  if (!text) throw new Error(`${name}: нет текста для журнала`);
  return { name, bump: fields.bump, text };
}

/** Notes sorted for the changelog: larger bumps first, then by file name. */
export function sortChanges(changes) {
  return [...changes].sort((first, second) => (
    BUMPS.indexOf(first.bump) - BUMPS.indexOf(second.bump) || first.name.localeCompare(second.name)
  ));
}

/** The largest bump among the notes, or undefined when there are none. */
export function releaseBump(changes) {
  return BUMPS.find((bump) => changes.some((change) => change.bump === bump));
}

/** 3.1.4 + minor → 3.2.0; lower numbers reset when a higher one grows. */
export function nextVersion(version, bump) {
  const match = VERSION.exec(version);
  if (!match) throw new Error(`Версия ${version} не в формате MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Неизвестный bump: ${bump}`);
}

/** Inserts a release section above the newest one, keeping the file intro. */
export function addRelease(changelog, version, date, changes) {
  const section = [`## ${version} — ${date}`, "", ...sortChanges(changes).map((change) => `- ${change.text}`), ""].join("\n");
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const first = lines.findIndex((line) => line.startsWith("## "));
  if (first < 0) return `${changelog.replace(/\s*$/, "")}\n\n${section}`;
  return [...lines.slice(0, first), section, ...lines.slice(first)].join("\n");
}

/**
 * Module statuses from src/modules/registry.tsx: { "maps": "active", ... }.
 * @param {string} source
 */
export function moduleStatuses(source) {
  const statuses = {};
  for (const match of source.matchAll(/\bid:\s*"([^"]+)"[\s\S]*?\bstatus:\s*"([^"]+)"/g)) statuses[match[1]] = match[2];
  return statuses;
}

/** Modules that became active (new or planned → active) between two registry versions. */
export function activatedModules(before, after) {
  const old = moduleStatuses(before);
  return Object.entries(moduleStatuses(after))
    .filter(([id, status]) => status === "active" && old[id] !== "active")
    .map(([id]) => id);
}
