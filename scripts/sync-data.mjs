import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { applyDataOverrides } from "./apply-data-overrides.mjs";

const entryPoints = ["catalog", "chemistry", "maps", "mobs"];

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function renameSnapshot(from, to) {
  // A reader or Windows antivirus can briefly hold a directory handle. Never
  // delete the live snapshot to work around that lock.
  for (let attempt = 0; ; attempt += 1) {
    try { return await rename(from, to); }
    catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

async function checkSource(source) {
  for (const module of entryPoints) {
    const path = resolve(source, module, "catalog.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!Number.isInteger(value.schemaVersion)) throw new Error(`Missing schemaVersion: ${path}`);
  }
}

async function filesIn(directory, root = directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Data snapshot must not contain symlinks: ${path}`);
    if (entry.isDirectory()) result.push(...await filesIn(path, root));
    else if (entry.isFile()) result.push(relative(root, path));
  }
  return result.sort();
}

async function fingerprint(directory) {
  const hash = createHash("sha256");
  const files = await filesIn(directory);
  for (let offset = 0; offset < files.length; offset += 32) {
    const batch = files.slice(offset, offset + 32);
    const contents = await Promise.all(batch.map((file) => readFile(resolve(directory, file))));
    batch.forEach((file, index) => {
      const contentHash = createHash("sha256").update(contents[index]).digest("hex");
      hash.update(`${file.split(sep).join("/")}\0${contentHash}\n`);
    });
  }
  return hash.digest("hex").slice(0, 20);
}

export async function syncData(appRoot, configuredSource) {
  const root = resolve(appRoot);
  const publicRoot = resolve(root, "public");
  const destination = resolve(publicRoot, "data");
  const candidates = configuredSource
    ? [resolve(root, configuredSource)]
    : [resolve(root, "../ssmc-wiki-data/data"), resolve(root, ".generated-data/data")];
  let source;
  for (const candidate of candidates) {
    if (await exists(candidate)) { source = candidate; break; }
  }
  if (!source) {
    // An explicitly prepared standalone snapshot remains usable offline.
    if (!configuredSource && await exists(destination)) {
      await checkSource(destination);
      console.log("Using existing public/data. Run data:sync with SSMC_DATA_SOURCE to refresh it.");
      return;
    }
    throw new Error("Local data not found. Clone ssmc-wiki-data next to ssmc-wiki-app, or set SSMC_DATA_SOURCE to its data directory.");
  }
  if ((await lstat(source)).isSymbolicLink()) throw new Error("SSMC_DATA_SOURCE must not be a symlink");
  const within = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
  };
  if (within(publicRoot, source) || within(source, publicRoot)) {
    throw new Error("SSMC_DATA_SOURCE must be separate from the application's public directory");
  }
  await checkSource(source);
  // Build and validate the replacement before touching the working snapshot.
  await mkdir(publicRoot, { recursive: true });
  const staging = await mkdtemp(resolve(publicRoot, ".data-stage-"));
  const stagedData = resolve(staging, "data");
  const backup = resolve(staging, "previous");
  let preserveBackup = false;
  try {
    await filesIn(source); // Reject links before cp can dereference external paths.
    await cp(source, stagedData, { recursive: true });
    const overrides = await applyDataOverrides(stagedData, resolve(root, "config/catalog-overrides.json"));
    const mapsRoot = resolve(stagedData, "maps");
    const assetRevision = await fingerprint(mapsRoot);
    const mapCatalogPath = resolve(mapsRoot, "catalog.json");
    const mapCatalog = JSON.parse(await readFile(mapCatalogPath, "utf8"));
    mapCatalog.assetRevision = assetRevision;
    await writeFile(mapCatalogPath, `${JSON.stringify(mapCatalog, null, 2)}\n`, "utf8");
    const hadSnapshot = await exists(destination);
    if (hadSnapshot) await renameSnapshot(destination, backup);
    try { await renameSnapshot(stagedData, destination); }
    catch (error) {
      if (hadSnapshot) {
        try { await renameSnapshot(backup, destination); }
        catch (restoreError) {
          preserveBackup = true;
          throw new Error(`Could not restore public/data; previous snapshot preserved at ${backup}`, { cause: restoreError });
        }
      }
      throw error;
    }
    console.log(`Prepared public/data from ${source}; ${overrides} overrides; map revision ${assetRevision}`);
  } finally {
    if (!within(publicRoot, staging) || staging === publicRoot) throw new Error("Unsafe staging path");
    if (!preserveBackup) await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncData(resolve(import.meta.dirname, ".."), process.env.SSMC_DATA_SOURCE);
}
