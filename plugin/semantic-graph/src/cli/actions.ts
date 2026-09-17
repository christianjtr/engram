import fs from "fs";
import { EngramHttpClient } from "../core/client";
import { buildSemanticGraph } from "../core/builder";
import { getSemanticGraphPath, getSemanticGraphFilename, ensureConfigDir } from "../config";
import { getCurrentProjectName } from "../utils/helpers";
import { GraphBuildOptions, SemanticGraph } from "../types";

export async function fetchAndBuildGraph(options?: GraphBuildOptions & { all?: boolean }): Promise<SemanticGraph> {
    const client = new EngramHttpClient();
    const detectedProject = (await client.resolveCurrentProject()) || getCurrentProjectName() || "default";
    const projectName = options?.all ? "all" : (options?.project || detectedProject);

    // Fetch in-memory from Engram server
    const [exportData, globalObs, conflicts] = await Promise.all([
        client.fetchExport({ project: options?.all ? undefined : projectName, allProjects: options?.all }),
        client.fetchGlobalObservations(typeof options?.globalLimit === "number" ? options.globalLimit : 20),
        client.fetchConflicts(options?.all ? undefined : projectName),
    ]);

    return buildSemanticGraph({
        projectName,
        observations: exportData.observations,
        globalObservations: globalObs,
        sessions: exportData.sessions,
        relations: conflicts,
        options,
    });
}

/**
 * Executes the core pipeline: fetches data from Engram HTTP, builds the graph, and saves it to disk.
 */
export async function runGenerateGraphAction(options?: GraphBuildOptions & { minify?: boolean; all?: boolean }) {
    ensureConfigDir();
    const graph = await fetchAndBuildGraph(options);
    const projectName = graph.slice.project;
    const graphPath = getSemanticGraphPath(projectName);

    const content = options?.minify ? JSON.stringify(graph) : JSON.stringify(graph, null, 2);
    fs.writeFileSync(graphPath, content, "utf-8");

    return {
        projectName,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        slice: graph.slice,
        graphPath,
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
        allGraphExists,
    };
}

/**
 * Displays guidance on graph exports.
 */
export function runExportInfoAction(): void {
    const projectName = getCurrentProjectName();
    const filename = getSemanticGraphFilename(projectName);
    const allFilename = getSemanticGraphFilename("all");
    console.log(`\n[Semantic Graph Export Information]`);
    console.log(`   - Project Graph:  ${filename}.json`);
    console.log(`   - Global Graph:   ${allFilename}.json`);
    console.log(`   AI Agents can consume these structured graphs to render Mermaid diagrams`);
    console.log(`   or produce targeted decision context on demand.\n`);
}
