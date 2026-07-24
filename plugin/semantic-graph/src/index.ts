import { runCliMenu } from "./cli/runner";
import { runGenerateGraphAction } from "./cli/actions";

/**
 * Main entry point for the semantic-graph plugin.
 * Runs the interactive CLI menu by default, or generates the graph directly via flag.
 */
export async function main(): Promise<void> {
    const args = process.argv.slice(2);

    // Direct execution flag to bypass CLI menu
    if (args.includes("--generate") || args.includes("-g")) {
        console.log("⚡ Generating semantic graph directly...");
        await runGenerateGraphAction({ minify: true });
        console.log("✨ Graph generated successfully!");
        return;
    }

    // Default: Run interactive CLI
    await runCliMenu();

    // Future milestone: Start the sidecar MCP server here
    // await startMcpServer(SEMANTIC_GRAPH_PATH);
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
    });
}