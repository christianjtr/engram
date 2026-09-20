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

/** Normalizes a project name into a safe, filesystem-friendly identifier. */
export function sanitizeProjectName(projectName: string): string {
    return projectName.trim().replace(/[/\\]+/g, "_") || "unknown-project";
}

/** Returns the canonical filename (without extension) for a project's graph. */
export const getSemanticGraphFilename = (projectName: string): string =>
    `engram_semantic_graph_${sanitizeProjectName(projectName)}`;

/** Returns the full absolute path for a project's graph JSON file. */
export const getSemanticGraphPath = (projectName: string): string =>
    path.join(ENGRAM_DIR, `${getSemanticGraphFilename(projectName)}.json`);

/** Returns the compact agent-context path for a project's graph snapshot. */
export const getSemanticContextPath = (projectName: string): string =>
    path.join(ENGRAM_DIR, `engram_semantic_context_${sanitizeProjectName(projectName)}.md`);

/** Ensures the graph output directory exists, creating it if necessary. */
export function ensureConfigDir(): void {
    if (!fs.existsSync(ENGRAM_DIR)) {
        fs.mkdirSync(ENGRAM_DIR, { recursive: true });
    }
}
