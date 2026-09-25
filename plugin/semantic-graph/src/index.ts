import { parseCliFlags } from "./cli/parseCliFlags";
import { runGenerateGraph } from "./cli/runner";
import { DEFAULT_GLOBAL_LIMIT } from "./config";

export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("-h") || args.includes("--help")) {
        console.log(`engram-semantic-graph v${__PLUGIN_VERSION__} — Semantic knowledge graph generator for Engram

Usage:
    engram-semantic-graph   Generate graph for the current harness project (default)
    engram-semantic-graph [flags]
    npx engram-semantic-graph [flags]

Flags:
    -a                      Generate a consolidated graph for all projects
    --global-limit=<n>      Limit global observations (default ${DEFAULT_GLOBAL_LIMIT})
    --all-globals           Include all global observations
    -s                      Include stale observations
    -h, --help              Show this help message

Examples:
    engram-semantic-graph
    engram-semantic-graph --global-limit=20 -s
    engram-semantic-graph --all-globals
    engram-semantic-graph -a

    (Or run without installing using 'npx engram-semantic-graph ...')
    (To launch the web visualizer, use: npm run visualize)
`);
        return;
    }

    const flags = parseCliFlags(args);

    console.log("Generating graph...");
    const stats = await runGenerateGraph(flags);

    console.log(`Graph saved (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);
    console.log(`File: ${stats.graphPath}`);
}

main().catch((error) => {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
});
