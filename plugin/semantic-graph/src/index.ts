import { runCliMenu } from "./cli/runner";
import { runGenerateGraphAction } from "./cli/actions";

/**
 * Main entry point for the engram-semantic-graph CLI.
 * Runs the interactive menu by default, or handles flags directly.
 */
export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("--help") || args.includes("-h")) {
        const scriptPath = process.argv[1] || "<path-to-plugin>/dist/semantic-graph.js";

        console.log(`engram-semantic-graph

Usage:
  node ${scriptPath}           Interactive menu
  node ${scriptPath} -g        Generate (current project, minified)
  node ${scriptPath} -g -a     All projects
  node ${scriptPath} -g -p <name>
  node ${scriptPath} -g -s     Include stale
  node ${scriptPath} -g -m     Force minified (default)
`);
        return;
    }

    if (args.includes("--generate") || args.includes("-g")) {
        const generateAll = args.includes("--all") || args.includes("-a");
        const includeStale = args.includes("--stale");
        const projectIdx = args.indexOf("--project");
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
