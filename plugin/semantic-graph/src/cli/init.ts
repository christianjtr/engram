#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SERVER_NAME = "engram-semantic-graph";
const LOCAL_PLUGIN_PATH = join(homedir(), "engram", "plugin", "semantic-graph", "dist", "semantic-graph.js");

const HELP = `engram-semantic-graph init

Usage:
  npm run init [--force] [--agent=<name>]

Supported agents: opencode, claude, cursor, windsurf, vscode
`;

interface McpEntry {
    name?: string;
    type?: string;
    command: string[] | string;
    args?: string[];
    enabled?: boolean;
    [key: string]: unknown;
}

interface AgentTarget {
    name: string;
    path: string;
    format: "opencode" | "mcpServers";
}

function getAgents(): AgentTarget[] {
    const home = homedir();
    const currentDir = process.cwd();
    return [
        {
            name: "OpenCode (Local)",
            path: join(currentDir, ".engram", "opencode.json"),
            format: "opencode",
        },
        {
            name: "Claude Code",
            path: join(home, ".claude", "mcp", "semantic-graph.json"),
            format: "mcpServers",
        },
        {
            name: "Cursor",
            path: join(home, ".cursor", "mcp.json"),
            format: "mcpServers",
        },
        {
            name: "Windsurf",
            path: join(home, ".codeium", "windsurf", "mcp_config.json"),
            format: "mcpServers",
        },
    ];
}

function readJsonObject(filePath: string): Record<string, unknown> {
    if (!existsSync(filePath)) return {};
    try {
        const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Ignorar si el JSON está corrupto o vacío
    }
    return {};
}

function writeJsonObject(filePath: string, data: unknown): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export function runInit(args: string[] = process.argv.slice(2)): void {
    if (args.includes("--help") || args.includes("-h")) {
        console.log(HELP);
        return;
    }

    const force = args.includes("--force");
    const agents = getAgents();

    for (const agent of agents) {
        if (agent.format !== "opencode" && !existsSync(dirname(agent.path))) {
            continue;
        }

        const config = readJsonObject(agent.path);

        if (agent.format === "opencode") {
            const existingList = Array.isArray(config.mcp) ? (config.mcp as McpEntry[]) : [];
            const index = existingList.findIndex((item) => item.name === SERVER_NAME);

            if (index >= 0 && !force) continue;

            const entry: McpEntry = {
                name: SERVER_NAME,
                type: "local",
                command: ["node", LOCAL_PLUGIN_PATH, "--mcp"],
                enabled: true,
            };

            if (index >= 0) existingList[index] = entry;
            else existingList.push(entry);

            config.mcp = existingList;
        } else {
            const existingServers = (config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers))
                ? (config.mcpServers as Record<string, McpEntry>)
                : {};

            if (existingServers[SERVER_NAME] && !force) continue;

            config.mcpServers = {
                ...existingServers,
                [SERVER_NAME]: {
                    command: "node",
                    args: [LOCAL_PLUGIN_PATH, "--mcp"],
                },
            };
        }

        writeJsonObject(agent.path, config);
        console.log(`✔ Configured ${agent.name} -> ${agent.path}`);
    }

    console.log("\nSetup complete! Restart your agents to load the tools.");
}

if (process.argv.includes("--init") || process.argv.includes("-i")) {
    runInit();
}