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
