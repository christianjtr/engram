import { fetchEngramData } from "./fetcher";
import { buildSemanticGraph } from "../core/graph";
import { ENGRAM_DIR, getSemanticGraphPath } from "../config";
import { writeAtomicFile, ensureDir } from "../utils/fileUtils";
import type { GraphBuildOptions } from "../types/graph";

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
