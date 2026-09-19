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
    intro("Engram Semantic Graph");

    let keepRunning = true;

    while (keepRunning) {
        const action = await select({
            message: "Select action",
            options: [
                {
                    value: "generate",
                    label: "Generate graph",
                    hint: "Create or update semantic graph"
                },
                {
                    value: "stats",
                    label: "Show status",
                    hint: "Current project and graph state"
                },
                {
                    value: "export-info",
                    label: "Show output locations",
                    hint: "Where graph files are saved"
                },
                {
                    value: "exit",
                    label: "Exit"
                }
            ],
        });

        if (isCancel(action)) {
            cancel("Operation cancelled.");
            process.exit(0);
        }

        if (action === "generate") {
            const scopeOption = await select({
                message: "Choose scope",
                options: [
                    {
                        value: "project",
                        label: "Current project only",
                        hint: "Recommended for most agents"
                    },
                    {
                        value: "all",
                        label: "All projects (global)",
                        hint: "Combined view across every project"
                    }
                ]
            });

            if (isCancel(scopeOption)) {
                cancel("Operation cancelled.");
                process.exit(0);
            }

            const formatOption = await select({
                message: "Output format",
                options: [
                    {
                        value: true,
                        label: "Minified (default)",
                        hint: "Smallest file, fastest for agents"
                    },
                    {
                        value: false,
                        label: "Pretty-printed",
                        hint: "Human-readable with indentation"
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
            s.start("Generating graph...");

            try {
                const stats = await runGenerateGraphAction({ minify: shouldMinify, all: generateAll });
                s.stop(`Graph saved (${shouldMinify ? "minified" : "pretty"})`);

                console.log(`\n  Nodes: ${stats.nodeCount}`);
                console.log(`  Edges: ${stats.edgeCount}`);
                console.log(`  File:  ${stats.graphPath}`);
            } catch (error) {
                s.stop("Generation failed.");
                console.error(error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        } else if (action === "export-info") {
            await runExportInfoAction();
        } else if (action === "stats") {
            const status = await runStatsAction();

            console.log(`\n  Project: ${status.projectName}`);
            console.log(`  Graph:   ${status.graphPath} [${status.graphExists ? "ok" : "missing"}]`);
            console.log(`  Global:  ${status.allGraphPath} [${status.allGraphExists ? "ok" : "missing"}]`);
        } else if (action === "exit") {
            keepRunning = false;
        }
    }

    outro("Done.");
}
