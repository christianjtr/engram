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

        console.log(`engram-semantic-graph - Deterministic Knowledge Graph Engine

Usage:
  node ${scriptPath}              Interactive CLI menu
  node ${scriptPath} --generate   Build graph for current project
  node ${scriptPath} --generate --all
  node ${scriptPath} --project <name>
  node ${scriptPath} --stale      Include expired/stale conventions
`);
        return;
    }

    if (args.includes("--generate") || args.includes("-g")) {
        const generateAll = args.includes("--all") || args.includes("-a");
        const includeStale = args.includes("--stale");
        const projectIdx = args.indexOf("--project");
        const project = projectIdx !== -1 && args[projectIdx + 1] ? args[projectIdx + 1] : undefined;

        console.log(
            `Generating semantic graph (${generateAll ? "all projects" : project || "current project"})...`
        );
        const stats = await runGenerateGraphAction({
            minify: true,
            all: generateAll,
            project,
            includeStale,
        });
        console.log(`Graph generated successfully! (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);
        console.log(`Saved to: ${stats.graphPath}`);
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