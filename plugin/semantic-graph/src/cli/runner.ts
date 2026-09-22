import path from "path";
import { fetchEngramData } from "./fetcher";
import { buildSemanticGraph } from "../core/graph";
import { renderAgentContext } from "../core/agent-context";
import { ENGRAM_DIR, getSemanticContextPath, getSemanticGraphPath } from "../config";
import { writeAtomicFile, ensureDir } from "../utils/fileUtils";
import type { GraphBuildOptions } from "../types/graph";

export async function runGenerateGraph(options?: GraphBuildOptions) {
    const rawData = await fetchEngramData(options);
    const graph = buildSemanticGraph(rawData);
    const projectName = graph.slice.project;

    const graphPath = getSemanticGraphPath(projectName);
    const contextPath = getSemanticContextPath(projectName);

    const graphContent = JSON.stringify(graph, null, 2);
    const contextContent = renderAgentContext(graph, {
        sourceGraph: path.basename(graphPath),
    });

    await ensureDir(ENGRAM_DIR);

    await Promise.all([
        writeAtomicFile(graphPath, graphContent),
        writeAtomicFile(contextPath, contextContent),
    ]);

    return {
        projectName,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        slice: graph.slice,
        graphPath,
        contextPath,
    };
}