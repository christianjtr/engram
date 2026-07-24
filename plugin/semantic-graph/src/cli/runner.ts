import { intro, outro, select, spinner, isCancel, cancel } from "@clack/prompts";
import {
    runGenerateGraphAction,
    runStatsAction,
    runExportInfoAction
} from "./actions";

/**
 * Runs the interactive CLI menu using Clack prompts.
 */
export async function runCliMenu(): Promise<void> {
    intro("🧠 Engram Semantic Graph CLI");

    let keepRunning = true;

    while (keepRunning) {
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
                    value: "export-info",
                    label: "Export Graph to Other Formats?",
                    hint: "Learn how to delegate Mermaid, DOT, or MD exports to your AI Agent"
                },
                {
                    value: "exit",
                    label: "Exit",
                    hint: "Quit the CLI"
                }
            ],
        });

        if (isCancel(action)) {
            cancel("Operation cancelled.");
            process.exit(0);
        }

        if (action === "generate") {
            const scopeOption = await select({
                message: "Select scope to generate:",
                options: [
                    {
                        value: "project",
                        label: "🎯 Active Project Only",
                        hint: "Scoped strictly to the current workspace project"
                    },
                    {
                        value: "all",
                        label: "🌐 Global Multi-Project Graph",
                        hint: "Consolidated graph combining all sessions, topics, and scopes"
                    }
                ]
            });

            if (isCancel(scopeOption)) {
                cancel("Operation cancelled.");
                process.exit(0);
            }

            const formatOption = await select({
                message: "Select output JSON format:",
                options: [
                    {
                        value: true,
                        label: "Minified (Recommended)",
                        hint: "Compressed single-line output for optimal performance and smaller size"
                    },
                    {
                        value: false,
                        label: "Pretty-Printed",
                        hint: "Formatted with indentation for easy manual inspection and debugging"
                    }
                ]
            });

            if (isCancel(formatOption)) {
                cancel("Operation cancelled.");
                process.exit(0);
            }

            const shouldMinify = formatOption as boolean;
            const generateAll = scopeOption === "all";

            const s = spinner();
            s.start("Generating knowledge graph...");

            try {
                const stats = await runGenerateGraphAction({ minify: shouldMinify, all: generateAll });
                s.stop(`✨ Knowledge graph generated successfully! (${shouldMinify ? "minified" : "pretty-printed"})`);

                console.log(`\n📊 Summary:`);
                console.log(`   - Nodes: ${stats.nodeCount}`);
                console.log(`   - Edges: ${stats.edgeCount}`);

                console.log(`\n💡 Tip: Ask your AI Agent to render this graph as Mermaid or DOT anytime!`);
            } catch (error) {
                s.stop("❌ Failed to generate graph.");
                console.error(error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        } else if (action === "export-info") {
            runExportInfoAction();
        } else if (action === "stats") {
            const status = runStatsAction();

            console.log(`\n🔍 Environment Status:`);
            console.log(`   - Current Project: ${status.projectName}`);
            console.log(`   - Project Graph:   ${status.graphPath} [${status.graphExists ? "Generated" : "Not Found"}]`);
            console.log(`   - Global Graph:    ${status.allGraphPath} [${status.allGraphExists ? "Generated" : "Not Found"}]`);
        } else if (action === "exit") {
            keepRunning = false;
        }
    }

    outro("Have a great day coding!");
}
