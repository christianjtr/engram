import fs from "fs";
import path from "path";
import type { SemanticGraphConfig } from "../types";

/**
 * Configuration paths and helpers for the semantic-graph plugin.
 * Centralizes all file locations under ~/.engram/semantic-graph.
 */

export const ENGRAM_DIR = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".engram",
    "semantic-graph"
);

export const SEMANTIC_GRAPH_FILENAME = "engram_semantic_graph";
export const CONFIG_PATH = path.join(ENGRAM_DIR, `${SEMANTIC_GRAPH_FILENAME}.config.json`);
export const SEMANTIC_GRAPH_PATH = path.join(ENGRAM_DIR, `${SEMANTIC_GRAPH_FILENAME}.json`);
export const TEMP_EXPORT_PATH = path.join(ENGRAM_DIR, "temp-export.json");

const DEFAULT_CONFIG: SemanticGraphConfig = {
    category_exclusions: []
};

/** Ensures the configuration directory exists. */
export function ensureConfigDir(): void {
    if (!fs.existsSync(ENGRAM_DIR)) {
        fs.mkdirSync(ENGRAM_DIR, { recursive: true });
    }
}

/** Returns the default semantic graph configuration. */
export function getDefaultConfig(): SemanticGraphConfig {
    return DEFAULT_CONFIG;
}

/** Persists a configuration object to disk. */
export function saveConfig(config: SemanticGraphConfig, configPath: string = CONFIG_PATH): void {
    ensureConfigDir();
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, "utf-8");
}

export function loadAndValidateConfig(configPath: string = CONFIG_PATH): SemanticGraphConfig {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found at: ${configPath}`);
    }

    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(raw) as SemanticGraphConfig;
    } catch (err) {
        throw new Error(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export function configExists(): boolean {
    return fs.existsSync(CONFIG_PATH);
}

export function resolveConfig(overrideConfig?: SemanticGraphConfig): SemanticGraphConfig {
    if (overrideConfig) return overrideConfig;

    if (configExists()) {
        try {
            return loadAndValidateConfig();
        } catch {
            return getDefaultConfig();
        }
    }

    return getDefaultConfig();
}
