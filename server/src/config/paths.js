import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolved from this file's own location, not process.cwd() — npm workspaces
 * (e.g. `npm run dev -w server`) run scripts with cwd set to the workspace
 * directory, not the repo root. Anchoring to cwd instead of this file caused
 * data/ to get scattered across two different locations depending on how the
 * process was started.
 */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function resolveFromRoot(...segments) {
  return path.resolve(PROJECT_ROOT, ...segments);
}

export function dataRoot() {
  return resolveFromRoot("data");
}

/**
 * DB columns must never store absolute filesystem paths under data/ — an
 * absolute path baked in on one machine (e.g. a Windows dev box) is meaningless
 * once the DB file is deployed elsewhere (e.g. Azure's Linux container). Store
 * relative-to-dataRoot() instead, normalized to forward slashes so the value
 * round-trips identically regardless of OS.
 */
export function toRelativeDataPath(absolutePath) {
  if (!absolutePath) return null;
  if (!path.isAbsolute(absolutePath)) return absolutePath.split(path.sep).join("/");
  return path.relative(dataRoot(), absolutePath).split(path.sep).join("/");
}

export function toAbsoluteDataPath(storedPath) {
  if (!storedPath) return null;
  if (path.isAbsolute(storedPath)) return storedPath;
  return path.join(dataRoot(), ...storedPath.split("/"));
}
