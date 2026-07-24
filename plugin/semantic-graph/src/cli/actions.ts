import fs from "fs";
import { buildKnowledgeGraph, saveKnowledgeGraph } from "../core/builder";
import { getSemanticGraphPath, getSemanticGraphFilename } from "../config";
import { getCurrentProjectName } from "../utils/helpers";

/**
 * Executes the core pipeline: fetches data from Engram, builds the graph, and saves it to disk.
 */
export async function runGenerateGraphAction(options?: { minify?: boolean; all?: boolean }) {
    const projectName = options?.all ? "all" : getCurrentProjectName();
    const graph = buildKnowledgeGraph(projectName);
    const minify = options?.minify ?? true;

    const graphPath = getSemanticGraphPath(projectName);
    saveKnowledgeGraph(graph, graphPath, { minify });

    return {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length
    };
}

/**
 * Checks the environment status, config, and current graph file health.
 */
export function runStatsAction(): {
    projectName: string;
    graphPath: string;
    graphExists: boolean;
    allGraphPath: string;
    allGraphExists: boolean;
} {
    const projectName = getCurrentProjectName();
    const graphPath = getSemanticGraphPath(projectName);
    const graphExists = fs.existsSync(graphPath);

    const allGraphPath = getSemanticGraphPath("all");
    const allGraphExists = fs.existsSync(allGraphPath);

    return {
        projectName,
        graphPath,
        graphExists,
        allGraphPath,
        allGraphExists
    };
}

/**
 * Displays guidance on delegating graph exports to the AI Agent.
 */
export function runExportInfoAction(): void {
    const projectName = getCurrentProjectName();
    const filename = getSemanticGraphFilename(projectName);
    const allFilename = getSemanticGraphFilename("all");
    console.log(`\n🤖 Knowledge Graph Export Information:`);
    console.log(`   - Project Graph:  ${filename}.json`);
    console.log(`   - Global Graph:   ${allFilename}.json`);
    console.log(`   No extra built-in exporters are required.`);
    console.log(`   AI Agents can directly consume these JSON files to render diagrams (Mermaid, DOT/Graphviz)`);
    console.log(`   or produce Markdown summaries on demand.\n`);
}
