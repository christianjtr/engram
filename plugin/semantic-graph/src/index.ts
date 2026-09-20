import { runCliMenu } from "./cli/runner";
import { runGenerateGraphAction } from "./cli/actions";

/**
 * Main entry point for the engram-semantic-graph CLI.
 * Runs the interactive menu by default, or handles flags directly.
 */
function parseCliFlags(args: string[]): { all: boolean; includeStale: boolean; project?: string; minify: boolean } {
    const validFlags = new Set(["-g", "-a", "-p", "-s", "-h"]);
    const unknownFlag = args.find((arg) => arg.startsWith("-") && !validFlags.has(arg));
    if (unknownFlag) {
        throw new Error(`Unknown flag: ${unknownFlag}`);
    }

    const generateAll = args.includes("-a");
    const includeStale = args.includes("-s");
    const projectIdx = args.findIndex((arg) => arg === "-p");
    const project = projectIdx !== -1 ? args[projectIdx + 1] : undefined;

    if (projectIdx !== -1 && !project) {
        throw new Error("Missing value for -p");
    }

    if (generateAll && project) {
        throw new Error("--all and --project cannot be used together");
    }

    return {
        all: generateAll,
        includeStale,
        project,
        minify: true,
    };
}

export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("-h")) {
        console.log(`engram-semantic-graph v${__PLUGIN_VERSION__} — Deterministic semantic knowledge graph for Engram

Usage:
  engram-semantic-graph           Interactive menu
    engram-semantic-graph -g        Generate graph (current project)
    engram-semantic-graph -a        Generate graph for all projects
    engram-semantic-graph -p <name> Generate graph for a specific project
    engram-semantic-graph -s        Include stale observations
    engram-semantic-graph -h        Show this help message

Notes:
    Only the short options shown above are supported.
    In all-project mode, topic identifiers are compact and project-qualified
    (for example: project:topic-name).

Example:
  engram-semantic-graph -p myproject -s
`);

        return;
    }

    const wantsGenerate =
        args.includes("-g") ||
        args.includes("-a") ||
        args.includes("-p") ||
        args.includes("-s");

    if (wantsGenerate) {
        const { all, includeStale, project, minify } = parseCliFlags(args);

        console.log(`Generating graph...`);
        const stats = await runGenerateGraphAction({
            minify,
            all,
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
