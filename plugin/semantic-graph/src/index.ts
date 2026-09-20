import { runCliMenu } from "./cli/runner";
import { runGenerateGraphAction } from "./cli/actions";

/**
 * Main entry point for the engram-semantic-graph CLI.
 * Runs the interactive menu by default, or handles flags directly.
 */
export function parseCliFlags(args: string[]): { all: boolean; includeStale: boolean; project?: string; minify: boolean } {
    const validFlags = new Set(["-g", "-a", "-p", "-s", "-h"]);
    const seenFlags = new Set<string>();
    let generateAll = false;
    let includeStale = false;
    let project: string | undefined;

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (!validFlags.has(arg)) {
            throw new Error(arg.startsWith("-") ? `Unknown flag: ${arg}` : `Unexpected argument: ${arg}`);
        }

        if (arg === "-h") continue;
        if (seenFlags.has(arg)) throw new Error(`Duplicate flag: ${arg}`);
        seenFlags.add(arg);

        if (arg === "-a") {
            generateAll = true;
            continue;
        }

        if (arg === "-s") {
            includeStale = true;
            continue;
        }

        if (arg === "-g") continue;

        const projectValue = args[++index];
        if (!projectValue || projectValue.startsWith("-")) {
            throw new Error("Missing value for -p");
        }

        project = projectValue.trim();
        if (!project) throw new Error("Missing value for -p");
    }

    if (generateAll && project) {
        throw new Error("-a and -p cannot be used together");
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
