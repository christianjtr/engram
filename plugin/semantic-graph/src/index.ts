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
        const scriptPath = process.argv[1] || "<path-to-plugin>/dist/semantic-graph.js";

        console.log(`engram-semantic-graph

Usage:
  node ${scriptPath}              Interactive CLI
  node ${scriptPath} --init       Register MCP in agent configs
  node ${scriptPath} --mcp        Start MCP server (stdio)
  node ${scriptPath} --generate   Build graph for current project
  node ${scriptPath} --generate --all
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