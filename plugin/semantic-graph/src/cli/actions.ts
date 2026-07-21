import fs from "fs";
import { buildKnowledgeGraph, saveKnowledgeGraph } from "../core/builder";
import { SEMANTIC_GRAPH_PATH, CONFIG_PATH } from "../config";

/**
 * Executes the core pipeline: fetches data from Engram, builds the graph, and saves it to disk.
 */
export async function runGenerateGraphAction(): Promise<{ nodeCount: number; edgeCount: number }> {
    console.log("🔄 Fetching memory data from Engram and building graph...");

    const graphJson = buildKnowledgeGraph();
    saveKnowledgeGraph(graphJson, SEMANTIC_GRAPH_PATH);

    return {
        nodeCount: graphJson.nodes.length,
        edgeCount: graphJson.edges.length,
    };
}

/**
 * Checks the environment status, config, and current graph file health.
 */
export function runStatsAction(): { configExists: boolean; graphExists: boolean; configPath: string; graphPath: string } {
    const configExists = fs.existsSync(CONFIG_PATH);
    const graphExists = fs.existsSync(SEMANTIC_GRAPH_PATH);

    return {
        configExists,
        graphExists,
        configPath: CONFIG_PATH,
        graphPath: SEMANTIC_GRAPH_PATH,
    };
}
