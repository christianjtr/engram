import fs from "fs";
import { EngramHttpClient } from "../core/client";
import { buildSemanticGraph } from "../core/builder";
import { getSemanticGraphPath, getSemanticGraphFilename, ensureConfigDir, ENGRAM_DIR } from "../config";
import { getCurrentProjectName } from "../utils/helpers";
import { GraphBuildOptions, SemanticGraph } from "../types";

/**
 * Fetches live data from the Engram HTTP server and builds the semantic graph in memory.
 * Does not write anything to disk — use runGenerateGraphAction for persistence.
 *
 * Project resolution order:
 * 1. options.all → "all" (multi-project global graph)
 * 2. options.project → explicit project name
 * 3. ENGRAM_PROJECT env var -> caller's process-level override
 * 4. GET /project/current?cwd=... -> server resolution of the caller's directory
 * Discovery ambiguity and fetch failures abort generation.
 */
export async function fetchAndBuildGraph(options?: GraphBuildOptions): Promise<SemanticGraph> {
    const client = new EngramHttpClient();
    const projectName = options?.all ? "all" : (options?.project?.trim() || await getCurrentProjectName());
    const selection = { project: options?.all ? undefined : projectName, allProjects: options?.all };
    const exportPromise = client.fetchExport(selection);
    // /observations has no pagination; an unbounded global request needs an export.
    const globalPromise = options?.globalLimit === "all"
        ? (options.all ? exportPromise : client.fetchExport({ allProjects: true }))
            .then((data) => ({
                observations: data.observations.filter((obs) => obs.scope === "global"),
                sessions: data.sessions,
            }))
        : client.fetchGlobalObservations(options?.globalLimit ?? 20)
            .then((observations) => ({ observations, sessions: [] }));

    const [exportData, globalData, conflicts] = await Promise.all([
        exportPromise,
        globalPromise,
        client.fetchConflicts(selection),
    ]);

    return buildSemanticGraph({
        projectName,
        observations: exportData.observations,
        globalObservations: globalData.observations,
        globalSessions: globalData.sessions,
        sessions: exportData.sessions,
        relations: conflicts,
        options,
    });
}

/**
 * Executes the full pipeline:
 * 1. Fetches data from the Engram HTTP server (in memory).
 * 2. Builds the semantic graph.
 * 3. Persists the result as a JSON file under ~/.engram/semantic-graph/.
 *
 * Returns a summary with node/edge counts and the absolute path of the saved file.
 */
export async function runGenerateGraphAction(options?: GraphBuildOptions & { minify?: boolean }) {
    const graph = await fetchAndBuildGraph(options);
    const projectName = graph.slice.project;
    const graphPath = getSemanticGraphPath(projectName);

    const content = options?.minify ? JSON.stringify(graph) : JSON.stringify(graph, null, 2);
    ensureConfigDir();
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
 * Returns a snapshot of the current environment: project name, graph file paths,
 * and whether those files exist on disk.
 */
export async function runStatsAction(): Promise<{
    projectName: string;
    graphPath: string;
    graphExists: boolean;
    allGraphPath: string;
    allGraphExists: boolean;
}> {
    const projectName = await getCurrentProjectName();
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
 * Displays the graph file locations and instructions for agent consumption.
 * Graphs are saved to disk after running --generate; this action shows where they are.
 */
export async function runExportInfoAction(): Promise<void> {
    const projectName = await getCurrentProjectName();
    const filename = getSemanticGraphFilename(projectName);
    const allFilename = getSemanticGraphFilename("all");

    console.log(`\n[Graph File Locations]`);
    console.log(`   Output directory: ${ENGRAM_DIR}`);
    console.log(`   - Project graph:  ${filename}.json`);
    console.log(`   - Global graph:   ${allFilename}.json`);
    console.log(``);
    console.log(`[Agent Consumption]`);
    console.log(`   AI Agents can read these JSON files directly to:`);
    console.log(`   - Render a Mermaid flowchart of the project's conventions`);
    console.log(`   - Identify active decisions and architecture rules before writing code`);
    console.log(`   - Detect conflicts or superseded conventions`);
    console.log(`   Run --generate first if the files do not exist yet.\n`);
}
