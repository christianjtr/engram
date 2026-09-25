import path from "node:path";
import { sanitizeFilename } from "../utils/fileUtils";

// ─── Plugin Operational Limits ───────────────────────────────────────────────
export const DEFAULT_TIMEOUT_MS = 10_000;
export const PREFLIGHT_TIMEOUT_MS = 1_500;
export const MAX_ERROR_BODY_LENGTH = 1_000;
export const MAX_CONFLICT_RELATIONS = 100_000;
export const DEFAULT_GLOBAL_LIMIT = 15;
export const MAX_GLOBAL_LIMIT = 100_000;

// ─── System Paths ────────────────────────────────────────────────────────────
/**
 * Configuration paths for the semantic-graph plugin.
 * All graph files are stored under ~/.engram/semantic-graph/.
 */
export const ENGRAM_DIR = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".engram",
    "semantic-graph",
);

const getSemanticGraphFilename = (projectName: string): string =>
    `engram_semantic_graph_${sanitizeFilename(projectName)}`;

/** Returns the full absolute path for a project's graph JSON file. */
export const getSemanticGraphPath = (projectName: string): string =>
    path.join(ENGRAM_DIR, `${getSemanticGraphFilename(projectName)}.json`);
