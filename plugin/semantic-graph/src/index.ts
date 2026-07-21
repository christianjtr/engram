import fs from "fs";
import { SEMANTIC_GRAPH_PATH } from "./config";
import { buildKnowledgeGraph, saveKnowledgeGraph } from "./core/builder";
import { runCliMenu } from "./cli/runner";

export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("--cli") || args.includes("-c")) {
        await runCliMenu();
        return;
    }

    const graphMissing = !fs.existsSync(SEMANTIC_GRAPH_PATH);
    const forceRebuild = args.includes("--force-rebuild");

    if (graphMissing || forceRebuild) {
        console.log("Building knowledge graph from Engram memory...");
        const graph = buildKnowledgeGraph();

        console.log("Saving graph...");
        saveKnowledgeGraph(graph, SEMANTIC_GRAPH_PATH);
        console.log(`Graph saved at: ${SEMANTIC_GRAPH_PATH}`);
    } else {
        console.log("Using cached graph.");
    }

    // Future milestone: Start the sidecar MCP server here
    // await startMcpServer(SEMANTIC_GRAPH_PATH);
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
