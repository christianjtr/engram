import { runGenerateGraph } from "./cli/runner";
import { parseCliFlags } from "./cli/parseCliFlags";
import { DEFAULT_GLOBAL_LIMIT } from "./config";

export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("-h")) {
        console.log(`engram-semantic-graph v${__PLUGIN_VERSION__} — Knowledge graph & agent context generator

Usage:
    engram-semantic-graph   Generate graph for current project (default)
    engram-semantic-graph [flags]
    npx engram-semantic-graph [flags]

Flags:
    -a          Generate graph for all projects
    -p <name>   Generate graph for a specific project
    --global-limit=<n>  Number of global observations (default ${DEFAULT_GLOBAL_LIMIT})
    --all-globals       Include all global observations
    -s                  Include stale observations
    -v                  Launch web visualizer server
    -h                  Show this help message

Examples:
    engram-semantic-graph
    engram-semantic-graph -p myproject -s
    engram-semantic-graph --global-limit=20
    engram-semantic-graph --all-globals
    engram-semantic-graph -v

    (Or run without installing using 'npx engram-semantic-graph ...')
`);
        return;
    }

    const flags = parseCliFlags(args);

    // if (flags.visualize) {
    //     console.log("Starting visualizer server...");
    //     const { startVisualizerServer } = await import("./visualizer/server");
    //     await startVisualizerServer({ project: flags.project });
    //     return;
    // }

    console.log("Generating graph...");
    const stats = await runGenerateGraph(flags);

    console.log(`Graph saved (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);
    console.log(`File: ${stats.graphPath}`);
    console.log(`Agent context: ${stats.contextPath}`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    });
}