import fs from "fs";
import path from "path";
import type { SemanticGraphConfig } from "../types";

/**
 * Configuration paths and memory helpers for the semantic-graph plugin.
 * Centralizes all system file locations under ~/.engram/semantic-graph.
 */
export const ENGRAM_DIR = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".engram",
    "semantic-graph"
);

// Official unified nomenclature for the plugin graph files
export const getSemanticGraphFilename = (projectName: string) => `engram_semantic_graph_${projectName}`;
export const getSemanticGraphPath = (projectName: string) => path.join(ENGRAM_DIR, `${getSemanticGraphFilename(projectName)}.json`);
export const getTempExportPath = (projectName: string) => path.join(ENGRAM_DIR, `temp-export-${projectName}.json`);

const DEFAULT_CONFIG: SemanticGraphConfig = {
    category_exclusions: []
};

export function ensureConfigDir(): void {
    if (!fs.existsSync(ENGRAM_DIR)) {
        fs.mkdirSync(ENGRAM_DIR, { recursive: true });
    }
}

/** Returns the default in-memory semantic graph configuration layout. */
export function getDefaultConfig(): SemanticGraphConfig {
    return { ...DEFAULT_CONFIG }; // Return a clean copy to avoid reference mutations
}

/**
 * Resolves the configuration dynamically JIT at runtime.
 * Prioritizes direct code overrides, otherwise falls back instantly to the memory baseline.
 */
export function resolveConfig(overrideConfig?: SemanticGraphConfig): SemanticGraphConfig {
    if (overrideConfig) return overrideConfig;
    return getDefaultConfig();
}
