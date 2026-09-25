import { parseCliFlags } from "./cli/parseCliFlags";
import { assertEngramReady } from "./cli/preflight";
import { runGenerateGraph } from "./cli/runner";
import { DEFAULT_GLOBAL_LIMIT } from "./config";
import { loadEnvFiles } from "./config/loadEnv";

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
    -s                      Include stale observations
    --globals               Include all global observations
    --globals=<n>           Limit global observations (default ${DEFAULT_GLOBAL_LIMIT})
    -h, --help              Show this help message

Examples:
    engram-semantic-graph
    engram-semantic-graph -s --globals=20
    engram-semantic-graph --globals
    engram-semantic-graph -a

    (Or run without installing using 'npx engram-semantic-graph ...')
`);
        return;
    }

    const flags = parseCliFlags(args);
    await loadEnvFiles();
    await assertEngramReady();

    console.log("Generating graph...");
    const stats = await runGenerateGraph(flags);

    console.log(`Graph saved (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);
    console.log(`File: ${stats.graphPath}`);
}

main().catch((error) => {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
});
