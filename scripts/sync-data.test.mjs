// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { syncData } from "./sync-data.mjs";

const roots = [];
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "ssmc-sync-test-"));
  roots.push(root);
  const source = resolve(root, "source");
  await mkdir(resolve(root, "config"));
  await writeFile(resolve(root, "config/catalog-overrides.json"), "");
  for (const name of ["catalog", "chemistry", "maps", "mobs"]) {
    await mkdir(resolve(source, name), { recursive: true });
    await writeFile(resolve(source, name, "catalog.json"), JSON.stringify({
      schemaVersion: name === "catalog" ? 4 : 1,
      items: { Item: { id: "Item", name: "Item", category: "Снаряжение" } },
      publicCatalog: { itemIds: ["Item"], categories: { "Снаряжение": ["Item"] } }, counts: {},
    }));
  }
  await writeFile(resolve(source, "maps/tile.webp"), "first image");
  return { root, source };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it("replaces stale files, applies empty overrides and uses a deterministic content revision", async () => {
  const { root, source } = await fixture();
  await syncData(root, source);
  const catalog = () => readFile(resolve(root, "public/data/maps/catalog.json"), "utf8").then(JSON.parse);
  const first = await catalog();
  await writeFile(resolve(root, "public/data/stale.json"), "old");
  await syncData(root, source);
  expect((await catalog()).assetRevision).toBe(first.assetRevision);
  await expect(readFile(resolve(root, "public/data/stale.json"))).rejects.toThrow();
  await writeFile(resolve(source, "maps/tile.webp"), "new image, same game commit");
  await syncData(root, source);
  expect((await catalog()).assetRevision).not.toBe(first.assetRevision);
});

it("keeps the previous snapshot when an override fails validation", async () => {
  const { root, source } = await fixture();
  await syncData(root, source);
  const path = resolve(root, "public/data/catalog/catalog.json");
  const before = await readFile(path, "utf8");
  await writeFile(resolve(root, "config/catalog-overrides.json"), JSON.stringify({ schemaVersion: 2, items: { Missing: { category: "Оружие" } } }));
  await expect(syncData(root, source)).rejects.toThrow("unpublished item");
  expect(await readFile(path, "utf8")).toBe(before);
});

it("rejects overlapping source and destination directories before replacing data", async () => {
  const { root, source } = await fixture();
  await syncData(root, source);
  await expect(syncData(root, resolve(root, "public/data"))).rejects.toThrow("must be separate");
  expect(await readFile(resolve(root, "public/data/maps/tile.webp"), "utf8")).toBe("first image");
});
