import * as p from "@clack/prompts";
import { SEMANTIC_GRAPH_PATH } from "./config";
import { buildKnowledgeGraph, saveKnowledgeGraph } from "./core/builder";

export async function runRebuildCLI(): Promise<void> {
    console.clear();
    p.intro("Engram Semantic Graph - Force Rebuild");

    const s = p.spinner();
    s.start("Building knowledge graph from Engram memory...");

    try {
        const graph = buildKnowledgeGraph();
        saveKnowledgeGraph(graph, SEMANTIC_GRAPH_PATH);
        s.stop("Knowledge graph successfully rebuilt!");

        p.note(
            `Location: ${SEMANTIC_GRAPH_PATH}\n` +
            `Nodes and relations updated from local memory store.`,
            "Status"
        );

        p.outro("Done");
    } catch (err) {
        s.stop("Failed to build graph");
        p.cancel(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}