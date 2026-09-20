import { runCliMenu } from "./cli/runner";
import { runGenerateGraphAction } from "./cli/actions";

/**
 * Main entry point for the engram-semantic-graph CLI.
 * Runs the interactive menu by default, or handles flags directly.
 */
export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("--help") || args.includes("-h")) {
        console.log(`engram-semantic-graph v${__PLUGIN_VERSION__} — Deterministic semantic knowledge graph for Engram

Usage:
  engram-semantic-graph           Interactive menu
  engram-semantic-graph -g        Generate graph (current project)
  engram-semantic-graph -a        All projects
  engram-semantic-graph -p <name> Specific project
  engram-semantic-graph -s        Include stale observations

Example:
  engram-semantic-graph -p myproject -s
  # or
  npx engram-semantic-graph -p myproject -s
`);

        return;
    }

    const wantsGenerate =
        args.includes("-g") || args.includes("--generate") ||
        args.includes("-a") || args.includes("--all") ||
        args.includes("-p") || args.includes("--project") ||
        args.includes("-s") || args.includes("--stale");

    if (wantsGenerate) {
        const generateAll = args.includes("--all") || args.includes("-a");
        const includeStale = args.includes("--stale") || args.includes("-s");
        const projectIdx = args.findIndex(a => a === "--project" || a === "-p");
        const project = projectIdx !== -1 && args[projectIdx + 1] ? args[projectIdx + 1] : undefined;
        const minify = true;

        console.log(`Generating graph...`);
        const stats = await runGenerateGraphAction({
            minify,
            all: generateAll,
            project,
            includeStale,
        });
        console.log(`Graph saved (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);
        console.log(`File: ${stats.graphPath}`);
        return;
    }

    await runCliMenu();
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
