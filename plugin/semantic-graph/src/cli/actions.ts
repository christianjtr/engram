import fs from "fs";
import { buildKnowledgeGraph, saveKnowledgeGraph } from "../core/builder";
import { SEMANTIC_GRAPH_PATH, SEMANTIC_GRAPH_FILENAME, CONFIG_PATH } from "../config";

/**
 * Executes the core pipeline: fetches data from Engram, builds the graph, and saves it to disk.
 */
export async function runGenerateGraphAction(options?: { minify?: boolean }) {
    const graph = buildKnowledgeGraph();
    const minify = options?.minify ?? true;

    saveKnowledgeGraph(graph, SEMANTIC_GRAPH_PATH, { minify });

    return {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length
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

/**
 * Displays guidance on delegating graph exports to the AI Agent.
 */
export function runExportInfoAction(): void {
    console.log(`\n🤖 Knowledge Graph Export Information:`);
    console.log(`   The generated semantic graph is stored in standard JSON format (${SEMANTIC_GRAPH_FILENAME}.json).`);
    console.log(`   No extra built-in exporters are required.`);
    console.log(`   AI Agents can directly consume this JSON file to render diagrams (Mermaid, DOT/Graphviz)`);
    console.log(`   or produce Markdown summaries on demand.\n`);
}
