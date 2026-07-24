import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SERVER_NAME = "engram-semantic-graph";

const HELP = `engram-semantic-graph init

Usage:
  npx engram-semantic-graph --init [--force] [--agent=<name>]

Options:
  --force            Overwrite existing MCP server config
  --agent=<name>     Target a specific agent (opencode, claude, cursor,
                     windsurf, vscode, gemini, antigravity, qwen, kiro, kilocode)
                     If omitted, registers for all detected agents

Registers the Engram Semantic Graph MCP server in your agent's config.
Restart the agent after init so tools are loaded.
`;

type McpFormat = "mcpServers" | "servers" | "opencode";

type AgentConfig = {
    slug: string;
    name: string;
    mcpPath: string;
    format: McpFormat;
    /** When false, only register if the config path already exists (or parent agent dir). */
    alwaysWrite: boolean;
};

function readJsonObject(filePath: string): Record<string, unknown> {
    if (!existsSync(filePath)) return {};
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${filePath} must contain a JSON object`);
    }
    return parsed as Record<string, unknown>;
}

function writeJsonObject(filePath: string, data: unknown): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function vscodeUserDir(): string {
    const home = homedir();
    if (process.platform === "darwin") {
        return join(home, "Library", "Application Support", "Code", "User");
    }
    if (process.platform === "win32") {
        return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Code", "User");
    }
    return join(home, ".config", "Code", "User");
}

function allAgents(): AgentConfig[] {
    const home = homedir();
    return [
        {
            slug: "opencode",
            name: "OpenCode",
            mcpPath: join(home, ".config", "opencode", "opencode.json"),
            format: "opencode",
            alwaysWrite: false,
        },
        {
            slug: "claude",
            name: "Claude Code",
            mcpPath: join(home, ".claude", "mcp", "semantic-graph.json"),
            format: "mcpServers",
            alwaysWrite: true,
        },
        {
            slug: "cursor",
            name: "Cursor",
            mcpPath: join(home, ".cursor", "mcp.json"),
            format: "mcpServers",
            alwaysWrite: false,
        },
        {
            slug: "windsurf",
            name: "Windsurf",
            mcpPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
            format: "mcpServers",
            alwaysWrite: false,
        },
        {
            slug: "vscode",
            name: "VS Code",
            mcpPath: join(vscodeUserDir(), "mcp.json"),
            format: "servers",
            alwaysWrite: false,
        },
        {
            slug: "gemini",
            name: "Gemini CLI",
            mcpPath: join(home, ".gemini", "settings.json"),
            format: "mcpServers",
            alwaysWrite: false,
        },
        {
            slug: "antigravity",
            name: "Antigravity CLI",
            mcpPath: join(home, ".gemini", "config", "mcp_config.json"),
            format: "mcpServers",
            alwaysWrite: false,
        },
        {
            slug: "qwen",
            name: "Qwen Code",
            mcpPath: join(home, ".qwen", "settings.json"),
            format: "mcpServers",
            alwaysWrite: false,
        },
        {
            slug: "kiro",
            name: "Kiro IDE",
            mcpPath: join(home, ".kiro", "settings", "mcp.json"),
            format: "mcpServers",
            alwaysWrite: false,
        },
        {
            slug: "kilocode",
            name: "Kilo Code",
            mcpPath: join(home, ".config", "kilo", "opencode.json"),
            format: "opencode",
            alwaysWrite: false,
        },
    ];
}

function topKey(format: McpFormat): string {
    switch (format) {
        case "servers":
            return "servers";
        case "opencode":
            return "mcp";
        default:
            return "mcpServers";
    }
}

/** Absolute path to this package's CLI entry (works from any agent cwd). */
function resolveMcpEntryPath(): string {
    return join(__dirname, "semantic-graph.js");
}

function createServerEntry(format: McpFormat): Record<string, unknown> {
    const entry = resolveMcpEntryPath();
    switch (format) {
        case "opencode":
            return {
                type: "local",
                command: ["node", entry, "--mcp"],
                enabled: true,
            };
        case "servers":
            return {
                type: "stdio",
                command: "node",
                args: [entry, "--mcp"],
            };
        default:
            return {
                command: "node",
                args: [entry, "--mcp"],
            };
    }
}

function isDetected(agent: AgentConfig): boolean {
    if (agent.alwaysWrite) {
        // Claude: write when ~/.claude exists or force full install path
        return existsSync(dirname(dirname(agent.mcpPath))) || existsSync(agent.mcpPath);
    }
    return existsSync(agent.mcpPath) || existsSync(dirname(agent.mcpPath));
}

function ensureMcpConfig(agent: AgentConfig, force: boolean): "wrote" | "kept" | "skipped" {
    if (!isDetected(agent) && !agent.alwaysWrite) {
        return "skipped";
    }

    // Claude without ~/.claude yet: still allow write (mkdir parent)
    if (agent.slug === "claude" && !existsSync(join(homedir(), ".claude"))) {
        return "skipped";
    }

    const config = readJsonObject(agent.mcpPath);
    const key = topKey(agent.format);
    const existingRaw = config[key];
    const existingServers =
        existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
            ? (existingRaw as Record<string, unknown>)
            : {};

    if (existingServers[SERVER_NAME] && !force) {
        return "kept";
    }

    config[key] = {
        ...existingServers,
        [SERVER_NAME]: createServerEntry(agent.format),
    };
    writeJsonObject(agent.mcpPath, config);
    return "wrote";
}

function parseAgentFlag(args: string[]): string | undefined {
    const eq = args.find((a) => a.startsWith("--agent="));
    if (eq) return eq.slice("--agent=".length).toLowerCase();
    const idx = args.indexOf("--agent");
    if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("-")) {
        return args[idx + 1].toLowerCase();
    }
    return undefined;
}

export async function runInit(args: string[] = process.argv.slice(2)): Promise<void> {
    if (args.includes("--help") || args.includes("-h")) {
        console.log(HELP);
        return;
    }

    const force = args.includes("--force");
    const agentFilter = parseAgentFlag(args);

    console.log("Engram Semantic Graph MCP Setup\n");

    let agents = allAgents();
    if (agentFilter) {
        agents = agents.filter((a) => a.slug === agentFilter || a.slug.startsWith(agentFilter));
        if (agents.length === 0) {
            console.log(`Unknown agent: ${agentFilter}`);
            console.log(
                "Supported: opencode, claude, cursor, windsurf, vscode, gemini, antigravity, qwen, kiro, kilocode\n"
            );
            process.exitCode = 1;
            return;
        }
    } else {
        agents = agents.filter((a) => isDetected(a));
    }

    if (agents.length === 0) {
        console.log("No supported agents detected.");
        console.log(
            "Supported: OpenCode, Claude Code, Cursor, Windsurf, VS Code, Gemini, Antigravity, Qwen, Kiro, Kilo Code\n"
        );
        console.log("Install an agent first, then run:");
        console.log("  npx engram-semantic-graph --init\n");
        console.log("Or target one explicitly:");
        console.log("  npx engram-semantic-graph --init --agent=opencode\n");
        return;
    }

    console.log(`Targeting ${agents.length} agent(s):\n`);

    for (const agent of agents) {
        const result = ensureMcpConfig(agent, force);
        if (result === "wrote") {
            console.log(`  Registered — ${agent.name}`);
        } else if (result === "kept") {
            console.log(`  Kept existing — ${agent.name} (use --force to update)`);
        } else {
            console.log(`  Skipped — ${agent.name}`);
        }
        console.log(`     Config: ${agent.mcpPath}\n`);
    }

    console.log("Setup complete. Restart your agent to load the MCP server.\n");
    console.log("Available tools:");
    console.log("  - get_project_graph       Full knowledge graph (for Mermaid/DOT)");
    console.log("  - get_active_constraints  Architectural CONSTRAINT nodes only\n");
    console.log(`MCP entry: node ${resolveMcpEntryPath()} --mcp`);
}
