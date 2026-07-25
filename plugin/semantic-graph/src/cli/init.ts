#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";

const LOCAL_PLUGIN_PATH = join(__dirname, "semantic-graph.js");
const SERVER_NAME = "engram-semantic-graph";

interface McpEntry {
    type?: string;
    command: string[] | string;
    args?: string[];
    enabled?: boolean;
    [key: string]: unknown;
}

interface AgentTarget {
    name: string;
    path: string;
    format: "opencode" | "mcpServers" | "vscode";
}

function getAgents(mode: "local" | "global" | "all"): AgentTarget[] {
    const home = homedir();
    const currentDir = process.cwd();

    const localAgent: AgentTarget = {
        name: "OpenCode (Local Project)",
        path: join(currentDir, ".opencode", "opencode.json"),
        format: "opencode",
    };

    const globalAgents: AgentTarget[] = [
        {
            name: "OpenCode (Global)",
            path: join(home, ".config", "opencode", "opencode.json"),
            format: "opencode",
        },
        {
            // Claude Desktop app — reads claude_desktop_config.json on startup.
            // Claude Code CLI users: run `claude mcp add` manually (see outro).
            name: "Claude Desktop",
            path: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
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
        {
            // VS Code uses key "servers" (not "mcpServers") and requires type: "stdio".
            name: "VS Code",
            path: join(home, "Library", "Application Support", "Code", "User", "mcp.json"),
            format: "vscode",
        },
    ];

    if (mode === "local") return [localAgent];
    if (mode === "global") return globalAgents;
    return [localAgent, ...globalAgents];
}

function readJsonObject(filePath: string): Record<string, unknown> {
    if (!existsSync(filePath)) {
        return {};
    }

    try {
        const content = readFileSync(filePath, "utf-8").trim();
        if (!content) {
            return {};
        }

        const parsed = JSON.parse(content) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }

        console.error(`⚠ File at ${filePath} does not contain a valid JSON object.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⚠ Error reading or parsing ${filePath}: ${message}`);
    }

    return {};
}

function writeJsonObject(filePath: string, data: Record<string, unknown>, format: "opencode" | "mcpServers" | "vscode"): void {
    mkdirSync(dirname(filePath), { recursive: true });

    // Inyecta el esquema oficial de OpenCode para autocompletado y validación
    if (format === "opencode" && !data["$schema"]) {
        data["$schema"] = "https://opencode.ai/config.json";
    }

    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export async function runInit(args: string[] = process.argv.slice(2)): Promise<void> {
    const force = args.includes("--force");
    let targetMode: "local" | "global" | "all" | null = null;

    if (args.includes("--local") || args.includes("-l")) {
        targetMode = "local";
    } else if (args.includes("--global") || args.includes("-g")) {
        targetMode = "global";
    } else if (args.includes("--all")) {
        targetMode = "all";
    }

    if (!targetMode) {
        p.intro("⚡ Engram Semantic Graph Setup");

        const selectedMode = await p.select({
            message: "Where would you like to configure the Engram Semantic Graph MCP server?",
            options: [
                { value: "local", label: "Local Project (.opencode/opencode.json)", hint: "Configures current working directory for OpenCode" },
                { value: "global", label: "Global System Agents", hint: "Configures Claude Desktop, Cursor, Windsurf, VS Code, and global OpenCode" },
                { value: "all", label: "Both Local & Global", hint: "Configures current project and all global system agents" },
            ],
        });

        if (p.isCancel(selectedMode)) {
            p.cancel("Setup cancelled.");
            process.exit(0);
        }

        targetMode = selectedMode as "local" | "global" | "all";
    }

    const s = p.spinner();
    s.start("Applying configuration...");

    const agents = getAgents(targetMode);
    let configuredCount = 0;

    for (const agent of agents) {
        if (agent.format !== "opencode" && !existsSync(dirname(agent.path))) {
            p.log.warn(`Skipped ${agent.name} — directory not found: ${dirname(agent.path)}`);
            continue;
        }

        const config = readJsonObject(agent.path);

        if (agent.format === "opencode") {
            const existingMcp = (config.mcp && typeof config.mcp === "object" && !Array.isArray(config.mcp))
                ? (config.mcp as Record<string, McpEntry>)
                : {};

            if (existingMcp[SERVER_NAME] && !force) continue;

            config.mcp = {
                ...existingMcp,
                [SERVER_NAME]: {
                    type: "local",
                    command: ["node", LOCAL_PLUGIN_PATH, "--mcp"],
                    enabled: true,
                },
            };
        } else if (agent.format === "vscode") {
            const existingServers = (config.servers && typeof config.servers === "object" && !Array.isArray(config.servers))
                ? (config.servers as Record<string, McpEntry>)
                : {};

            if (existingServers[SERVER_NAME] && !force) continue;

            config.servers = {
                ...existingServers,
                [SERVER_NAME]: {
                    type: "stdio",
                    command: "node",
                    args: [LOCAL_PLUGIN_PATH, "--mcp"],
                },
            };
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

        writeJsonObject(agent.path, config, agent.format);
        configuredCount++;
        p.log.success(`Configured ${agent.name} -> ${agent.path}`);
    }

    s.stop("Configuration applied!");

    if (configuredCount === 0) {
        p.note("No files were updated. Configurations already exist (use --force to overwrite).");
    }

    if (targetMode === "global" || targetMode === "all") {
        p.note(
            `Claude Code CLI is not auto-configured (it does not use a JSON config file).\nTo register manually, run:\n\n  claude mcp add ${SERVER_NAME} node ${LOCAL_PLUGIN_PATH} --mcp`,
            "Claude Code CLI — manual step"
        );
    }

    p.outro("Setup complete! Restart your agents to load the MCP tools.");
}