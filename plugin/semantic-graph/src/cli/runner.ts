import { intro, outro, select, spinner } from "@clack/prompts";
import { runGenerateGraphAction, runStatsAction } from "./actions";

/**
 * Runs the interactive CLI menu using Clack prompts.
 */
export async function runCliMenu(): Promise<void> {
    intro("🧠 Engram Semantic Graph CLI");

    const action = await select({
        message: "What would you like to do?",
        options: [
            {
                value: "generate",
                label: "Generate & Save Knowledge Graph",
                hint: "Fetches fresh data from Engram and builds the graph"
            },
            {
                value: "stats",
                label: "Check Environment & Status",
                hint: "Inspects configuration and graph file paths"
            },
            {
                value: "exit",
                label: "Exit",
                hint: "Quit the CLI"
            }
        ],
    });

    if (action === "generate") {
        const s = spinner();
        s.start("Generating knowledge graph...");

        try {
            const stats = await runGenerateGraphAction();
            s.stop("✨ Knowledge graph generated successfully!");

            console.log(`\n📊 Summary:`);
            console.log(`   - Nodes: ${stats.nodeCount}`);
            console.log(`   - Edges: ${stats.edgeCount}`);
        } catch (error) {
            s.stop("❌ Failed to generate graph.");
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    } else if (action === "stats") {
        const status = runStatsAction();

        console.log(`\n🔍 Environment Status:`);
        console.log(`   - Config Path: ${status.configPath} [${status.configExists ? "Found" : "Missing"}]`);
        console.log(`   - Graph Path:  ${status.graphPath} [${status.graphExists ? "Generated" : "Not Found"}]`);
    }

    outro("Have a great day coding!");
}
