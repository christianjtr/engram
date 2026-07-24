import { runCliMenu } from "./cli/runner";
import { runGenerateGraphAction } from "./cli/actions";
import { runInit } from "./cli/init";
import { startMcpServer } from "./mcp/server";

/**
 * Main entry point for the semantic-graph plugin.
 * Runs the interactive CLI menu by default, or handles flags for init, MCP, and graph generation.
 */
export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes("--init") || args.includes("-i")) {
        await runInit(args);
        return;
    }

    if (args.includes("--help") || args.includes("-h")) {
        console.log(`engram-semantic-graph

Usage:
  npx engram-semantic-graph              Interactive CLI
  npx engram-semantic-graph --init       Register MCP in agent configs
  npx engram-semantic-graph --mcp        Start MCP server (stdio)
  npx engram-semantic-graph --generate   Build graph for current project
  npx engram-semantic-graph --generate --all
`);
        return;
    }

    if (args.includes("--mcp") || args.includes("-m")) {
        await startMcpServer();
        return;
    }

    if (args.includes("--generate") || args.includes("-g")) {
        const generateAll = args.includes("--all") || args.includes("-a");
        console.log(
            `Generating semantic graph directly (${generateAll ? "all projects" : "current project"})...`
        );
        await runGenerateGraphAction({ minify: true, all: generateAll });
        console.log("Graph generated successfully!");
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
