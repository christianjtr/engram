import fs from "fs";
import path from "path";

/**
 * Configuration paths for the semantic-graph plugin.
 * All graph files are stored under ~/.engram/semantic-graph/.
 */
export const ENGRAM_DIR = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".engram",
    "semantic-graph"
);

/** Returns the canonical filename (without extension) for a project's graph. */
export const getSemanticGraphFilename = (projectName: string): string =>
    `engram_semantic_graph_${projectName}`;

/** Returns the full absolute path for a project's graph JSON file. */
export const getSemanticGraphPath = (projectName: string): string =>
    path.join(ENGRAM_DIR, `${getSemanticGraphFilename(projectName)}.json`);

/** Ensures the graph output directory exists, creating it if necessary. */
export function ensureConfigDir(): void {
    if (!fs.existsSync(ENGRAM_DIR)) {
        fs.mkdirSync(ENGRAM_DIR, { recursive: true });
    }
}
