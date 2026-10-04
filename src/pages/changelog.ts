import { nextVersion, parseChange, releaseBump, sortChanges } from "../../scripts/changes.mjs";

export type ChangelogEntry = {
  /** Version number, or undefined for the unreleased section. */
  version?: string;
  date?: string;
  /** For unreleased notes: the version `npm run release` would produce. */
  nextVersion?: string;
  intro: string;
  items: string[];
};

/**
 * Unreleased entry built from .changes/*.md sources keyed by path.
 * Invalid notes throw, so a broken note fails the build instead of disappearing.
 */
export function pendingRelease(sources: Record<string, string>, currentVersion: string): ChangelogEntry | undefined {
  const changes = Object.entries(sources)
    .filter(([path]) => !path.endsWith("/README.md"))
    .map(([path, source]) => parseChange(source, path.split("/").at(-1) ?? path));
  const bump = releaseBump(changes);
  if (!bump) return undefined;
  return { nextVersion: nextVersion(currentVersion, bump), intro: "", items: sortChanges(changes).map((change) => change.text) };
}

const RELEASE_HEADING = /^(\d+\.\d+\.\d+)(?:\s+[—-]\s+(\d{4}-\d{2}-\d{2}))?$/;

/** Parses the subset of Markdown used by CHANGELOG.md: `##` sections, paragraphs and `-` items. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | undefined;
  let target: "intro" | "item" = "intro";

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (rawLine.startsWith("## ")) {
      const heading = rawLine.slice(3).trim();
      const release = RELEASE_HEADING.exec(heading);
      current = release ? { version: release[1], date: release[2], intro: "", items: [] } : { intro: "", items: [] };
      entries.push(current);
      target = "intro";
    } else if (!current || !line) {
      target = "intro";
    } else if (line.startsWith("- ")) {
      current.items.push(line.slice(2));
      target = "item";
    } else if (target === "item" && rawLine.startsWith("  ")) {
      current.items[current.items.length - 1] += ` ${line}`;
    } else {
      current.intro = current.intro ? `${current.intro} ${line}` : line;
    }
  }
  return entries.filter((entry) => entry.intro || entry.items.length);
}
