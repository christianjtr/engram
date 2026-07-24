# Engram Semantic Graph

Deterministic semantic knowledge graph plugin for Engram via an **independent MCP server**.

Does not modify Engram core. Follows the same local-install + `init` pattern as Pi's `gentle-engram`.

## Quick start

```bash
# From your project (local install)
npm install engram-semantic-graph

# Build if working from this monorepo path
npm run build

# Register MCP in detected agent configs (OpenCode, Claude, Cursor, …)
npx engram-semantic-graph --init

# Restart your agent
```

Update an existing registration:

```bash
npx engram-semantic-graph --init --force
```

Target one agent:

```bash
npx engram-semantic-graph --init --agent=opencode
```

## What you get

Independent MCP server name: **`engram-semantic-graph`**

| Tool | Purpose |
|------|---------|
| `get_project_graph` | Full Graphlib knowledge graph for a project (or `all`) — use for Mermaid / DOT |
| `get_active_constraints` | Nodes with `reasoning_role = CONSTRAINT` |

## Commands

```bash
npx engram-semantic-graph              # Interactive CLI
npx engram-semantic-graph --init       # Register MCP (like pi-engram init)
npx engram-semantic-graph --mcp        # Stdio MCP server (agents launch this)
npx engram-semantic-graph --generate   # Build graph for current project
npx engram-semantic-graph --generate --all
```

## Manual MCP config

`init` writes an absolute `node …/dist/semantic-graph.js --mcp` entry so agents work from any cwd.

Templates (placeholders only): [`mcp-config-templates/`](./mcp-config-templates/).

**OpenCode** (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "engram-semantic-graph": {
      "type": "local",
      "command": ["node", "/path/to/node_modules/engram-semantic-graph/dist/semantic-graph.js", "--mcp"],
      "enabled": true
    }
  }
}
```

**Claude / Cursor / Windsurf** (`mcpServers`):

```json
{
  "mcpServers": {
    "engram-semantic-graph": {
      "command": "node",
      "args": ["/path/to/node_modules/engram-semantic-graph/dist/semantic-graph.js", "--mcp"]
    }
  }
}
```

**VS Code Copilot** (`servers` + `type: "stdio"`): see `mcp-config-templates/vscode.json`.

## Supported agents (via `--init`)

OpenCode, Claude Code, Cursor, Windsurf, VS Code, Gemini CLI, Antigravity, Qwen, Kiro, Kilo Code.

## Architecture

Thin adapter pattern (Engram plugin rules):

- `src/mcp/server.ts` — MCP stdio surface only
- `src/core/builder/` — graph fetch / reason / build
- `src/cli/` — interactive menu + `init` registration

Independent of core `engram mcp` (`mem_*` tools). Run both side by side.

## License

MIT
