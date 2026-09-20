import { intro, outro, select, spinner, isCancel, cancel } from "@clack/prompts";
import {
    runGenerateGraphAction,
    runStatsAction,
    runExportInfoAction
} from "./actions";

type MenuAction = "generate" | "stats" | "export-info" | "exit";

interface GeneratePromptOptions {
    all: boolean;
    minify: boolean;
}

function cancelOperation(): never {
    cancel("Operation cancelled.");
    process.exit(0);
}

/**
 * Prompts user for generation scope and formatting preferences.
 */
async function promptGenerateOptions(): Promise<GeneratePromptOptions> {
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

    if (isCancel(scopeOption)) cancelOperation();

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

    if (isCancel(formatOption)) cancelOperation();

    return {
        all: scopeOption === "all",
        minify: formatOption as boolean
    };
}

/**
 * Handles the 'generate' action flow.
 */
async function handleGenerateAction(): Promise<void> {
    const { all, minify } = await promptGenerateOptions();

    const s = spinner();
    s.start("Generating graph...");

    try {
        const stats = await runGenerateGraphAction({ minify, all });
        s.stop(`Graph saved (${minify ? "minified" : "pretty"})`);

        console.log(`\n  Nodes: ${stats.nodeCount}`);
        console.log(`  Edges: ${stats.edgeCount}`);
        console.log(`  File:  ${stats.graphPath}\n`);
    } catch (error) {
        s.stop("Generation failed.");
        console.error(error instanceof Error ? error.message : String(error));
        // Avoid process.exit(1) here so the menu doesn't crash entirely on a network error
    }
}

/**
 * Handles the 'stats' action display.
 */
async function handleStatsAction(): Promise<void> {
    const status = await runStatsAction();
    const formatStatus = (path: string, exists: boolean) => `${path} [${exists ? "ok" : "missing"}]`;

    console.log(`\n  Project: ${status.projectName}`);
    console.log(`  Graph:   ${formatStatus(status.graphPath, status.graphExists)}`);
    console.log(`  Global:  ${formatStatus(status.allGraphPath, status.allGraphExists)}\n`);
}

/**
 * Handles the 'export-info' action display.
 */
async function handleExportInfoAction(): Promise<void> {
    const info = await runExportInfoAction();

    console.log(`\n  Output directory: ${info.outputDir}`);
    console.log(`  Project graph:    ${info.projectFilename}`);
    console.log(`  Global graph:     ${info.globalFilename}\n`);
    console.log(`  [Agent Consumption]`);
    console.log(`  AI Agents can read these JSON files directly to:`);
    console.log(`  - Render a Mermaid flowchart of the project's conventions`);
    console.log(`  - Identify active decisions before writing code`);
    console.log(`  - Detect conflicts or superseded conventions\n`);
}

/**
 * Runs the interactive CLI menu using Clack prompts.
 */
export async function runCliMenu(): Promise<void> {
    intro("Engram Semantic Graph");

    let keepRunning = true;

    const actionHandlers: Record<MenuAction, () => Promise<void>> = {
        "generate": handleGenerateAction,
        "export-info": handleExportInfoAction, // Updated to use the wrapper
        "stats": handleStatsAction,
        "exit": async () => {
            keepRunning = false;
        }
    };

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

        if (isCancel(action)) cancelOperation();

        const handler = actionHandlers[action as MenuAction];
        if (handler) {
            await handler();
        }
    }

    outro("Done.");
}