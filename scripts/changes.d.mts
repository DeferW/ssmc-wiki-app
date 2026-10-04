export type Bump = "major" | "minor" | "patch";
export type Change = { name: string; bump: Bump; text: string };

export const BUMPS: Bump[];
export function parseChange(source: string, name: string): Change;
export function sortChanges(changes: Change[]): Change[];
export function releaseBump(changes: Change[]): Bump | undefined;
export function nextVersion(version: string, bump: Bump): string;
export function addRelease(changelog: string, version: string, date: string, changes: Change[]): string;
export function moduleStatuses(source: string): Record<string, string>;
export function activatedModules(before: string, after: string): string[];
