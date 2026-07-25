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

## What you get

Independent MCP server name: **`engram-semantic-graph`**

| Tool | Purpose |
|------|---------|
| `get_project_graph` | Enriched knowledge graph for a project (or `all`) — includes `summary`, `timeline`, and full `graph` block for Mermaid / DOT |

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

Reference snippets (content to merge into each agent's config file — not standalone files):
[`mcp-config-templates/`](./mcp-config-templates/).

| Template file | Merge into |
|---------------|-----------|
| `claude.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| `opencode.json` | `~/.config/opencode/opencode.json` or `<project>/.opencode/opencode.json` |
| `cursor.json` | `~/.cursor/mcp.json` |
| `windsurf.json` | `~/.codeium/windsurf/mcp_config.json` |
| `vscode.json` | `~/Library/Application Support/Code/User/mcp.json` (macOS) |

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

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

**Cursor** (`~/.cursor/mcp.json`) and **Windsurf** (`~/.codeium/windsurf/mcp_config.json`) use the same `mcpServers` format above.

**VS Code** (`~/Library/Application Support/Code/User/mcp.json`) — uses `servers` key and requires `type: "stdio"`:

```json
{
  "servers": {
    "engram-semantic-graph": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/node_modules/engram-semantic-graph/dist/semantic-graph.js", "--mcp"]
    }
  }
}
```

**Claude Code CLI** — does not use a JSON config file. Register manually:

```bash
claude mcp add engram-semantic-graph node /path/to/dist/semantic-graph.js --mcp
```

## Supported agents

### Auto-configured via `--init`

| Agent | Config written |
|-------|---------------|
| OpenCode (local project) | `<cwd>/.opencode/opencode.json` |
| OpenCode (global) | `~/.config/opencode/opencode.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code | `~/Library/Application Support/Code/User/mcp.json` |

Agents whose config directory does not exist are skipped with a warning.

### Manual config only

- **Claude Code CLI**: `claude mcp add engram-semantic-graph node /path/to/dist/semantic-graph.js --mcp`
- **Gemini CLI, Kiro, Kilo Code, Antigravity, Qwen**: see [`mcp-config-templates/`](./mcp-config-templates/) for reference snippets.

## Architecture

Thin adapter pattern (Engram plugin rules):

- `src/mcp/server.ts` — MCP stdio surface only
- `src/core/builder/` — graph fetch / reason / build
- `src/cli/` — interactive menu + `init` registration

Independent of core `engram mcp` (`mem_*` tools). Run both side by side.

## License

MIT
