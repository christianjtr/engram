import { ENGRAM_DIR, getSemanticGraphPath } from "../config";
import { buildSemanticGraph } from "../core/graph";
import type { GraphBuildOptions } from "../types/graph";
import { ensureDir, writeAtomicFile } from "../utils/fileUtils";
import { fetchEngramData } from "./fetcher";

export async function runGenerateGraph(options?: GraphBuildOptions) {
    const rawData = await fetchEngramData(options);
    const graph = buildSemanticGraph(rawData);
    const projectName = graph.slice.project;

    const graphPath = getSemanticGraphPath(projectName);
    const graphContent = JSON.stringify(graph, null, 2);

    await ensureDir(ENGRAM_DIR);
    await writeAtomicFile(graphPath, graphContent);

    return {
        projectName,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        slice: graph.slice,
        graphPath,
    };
}
