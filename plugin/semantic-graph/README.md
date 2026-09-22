# Engram Semantic Graph

Standalone TypeScript CLI that reads Engram memory data through the local HTTP server and writes two derived snapshots: a complete semantic graph as JSON and a compact agent context as Markdown. Engram remains the source of truth: this package does not access SQLite, mutate memories, judge conflicts, or run synchronization.

## What It Provides

- Project-scoped graphs by default, or a combined all-project graph.
- A bounded global context: the default includes up to 15 global observations (configurable via --global-limit).
- Filtering of deleted observations and, by default, stale observations.
- Strict UTC lifecycle handling for `review_after`; a timestamp at or before the build reference time is stale.
- Project, topic, observation, and optional session nodes connected with typed edges.
- Persisted judged relations from `/conflicts`, including `SUPERSEDES`, `CONFLICTS_WITH`, or `RELATED_TO` edges when both endpoints are present.
- Schema validation for HTTP responses with Zod.
- A deterministic `agent-context.md` projection derived from the same graph as the JSON.
- Atomic publication of each artifact through unique temporary files and rename.

The builder also supports topic and type filters, custom global limits, session nodes, and an injected reference date as a TypeScript API. --global-limit and --all-globals expose the options in the CLI.

## Requirements

- Node.js 20.12 or later
- npm
- A running Engram HTTP server

Start the local server:

```bash
engram serve
```

The default server URL is `http://127.0.0.1:7437`.

## Build and Run

```bash
cd plugin/semantic-graph
npm install
npm run build
```

The production bundle is written to `dist/semantic-graph.js`.

The CLI is intentionally non-interactive. Every invocation either prints help or generates a graph and its companion agent context.

### Short CLI flags

Only the short flags below are supported:

| Flag        | Meaning                                    |
| ----------- | ------------------------------------------ |
| `-g`        | Generate the current-project graph         |
| `-a`        | Generate one graph containing all projects |
| `-p <name>` | Generate a graph for an explicit project   |
| `-s`        | Include stale observations                 |
| `-h`        | Print help                                 |

Examples:

```bash
# Current project using the package entry point
npm start

# Current project, excluding stale observations
node dist/semantic-graph.js -g

# Current project, including stale observations
node dist/semantic-graph.js -g -s

# A specific project
node dist/semantic-graph.js -g -p engram

# All projects
node dist/semantic-graph.js -g -a

# Package shortcut for explicit current-project generation
npm run generate
```

Running without arguments generates the current-project graph. `-a` and `-p` cannot be used together. `-p` requires a non-empty value. Unknown, duplicate, and positional arguments are rejected. `-g` is optional when another generation flag such as `-a`, `-p`, or `-s` is present.

## Project Resolution

For project-scoped generation, resolution follows this order:

1. `-a` selects all projects.
2. `-p <name>` selects the explicit project.
3. `ENGRAM_PROJECT` selects the project from the environment.
4. The CLI asks `/project/current?cwd=<caller-directory>` for Engram's canonical resolution.

The server may apply its own project resolver policy. Use `-p` when the target must be explicit.

## Server Configuration

| Variable            | Default                 | Purpose                                 |
| ------------------- | ----------------------- | --------------------------------------- |
| `ENGRAM_URL`        | `http://127.0.0.1:7437` | Complete server base URL                |
| `ENGRAM_PORT`       | `7437`                  | Port used when `ENGRAM_URL` is not set  |
| `ENGRAM_HTTP_TOKEN` | unset                   | Bearer token for authenticated requests |
| `ENGRAM_PROJECT`    | unset                   | Project override used during discovery  |

Requests use a 10-second timeout by default. Keep the server on loopback, or use HTTPS before configuring a remote URL with an authentication token.

## Output

Snapshots are saved under:

```text
~/.engram/semantic-graph/
  engram_semantic_graph_<project>.json
  engram_semantic_context_<project>.md
  engram_semantic_graph_all.json
  engram_semantic_context_all.md
```

Project names are trimmed and path separators are replaced with `_` for filenames. The JSON contains full observation content, including personal observations within the selected project. Treat both files as private memory exports.

Generation failures leave existing snapshots unchanged when the failure occurs before publication. JSON and Markdown are generated from the same in-memory graph and share its `generatedAt` value, but two filesystem renames cannot form one transactional operation. Separate HTTP requests are not one transactional database snapshot; regenerate if the store changes during generation.

### Agent context

The Markdown snapshot is a bounded, deterministic view for low-cost initial agent context. It uses versioned front matter and prioritizes active decisions, architecture, conventions, relevant relations, provenance, and warnings. It is limited to 12,000 characters by default and retains observation IDs and topics so an agent can consult the full JSON or MCP for more detail. It is not a replacement for Engram or MCP.

Example:

```md
---
format: engram-agent-context
version: 1
project: engram
generated_at: 2026-09-20T17:00:00.000Z
source_graph: engram_semantic_graph_engram.json
exhaustive: false
---

# Engram Agent Context

## Active Decisions

- [decision] Use HTTP boundaries instead of direct SQLite access.
  topic: architecture/semantic-graph
  project: engram
  observation: obs:31

## Warnings

- This is a bounded snapshot and may omit historical observations.
```

## Graph Format

The JSON document contains `nodes`, `edges`, `types`, and `slice`:

```json
{
    "nodes": [
        {
            "id": "global:context",
            "category": "GLOBAL_CONTEXT",
            "label": "GLOBAL CONTEXT"
        },
        {
            "id": "project:engram",
            "category": "PROJECT",
            "label": "PROJECT: engram",
            "metadata": { "project": "engram" }
        },
        {
            "id": "topic:architecture/plugins",
            "category": "TOPIC",
            "label": "TOPIC: architecture/plugins"
        },
        {
            "id": "obs:42",
            "category": "OBSERVATION",
            "label": "Thin Adapters in TS",
            "type": "architecture",
            "lifecycle": "active",
            "topic_key": "architecture/plugins",
            "content": "Adapters in plugin/ must remain thin..."
        }
    ],
    "edges": [
        {
            "source": "project:engram",
            "target": "global:context",
            "relation": "INHERITS"
        },
        {
            "source": "topic:architecture/plugins",
            "target": "project:engram",
            "relation": "BELONGS_TO"
        },
        {
            "source": "obs:42",
            "target": "topic:architecture/plugins",
            "relation": "BELONGS_TO"
        }
    ],
    "types": {
        "architecture": {
            "type": "architecture",
            "label": "ARCHITECTURE",
            "isConventionLike": true
        }
    },
    "slice": {
        "project": "engram",
        "totalObservations": 24,
        "activeCount": 22,
        "staleCount": 2,
        "globalRulesInherited": 10,
        "globalRulesTotal": 20,
        "topicsCount": 5,
        "isExhaustive": false,
        "generatedAt": "2026-09-20T17:00:00.000Z"
    }
}
```

### All-project graphs

In all-project mode, each represented project gets its own project node. Topic identity includes both project and topic in an encoded JSON tuple to prevent collisions. For example:

```text
topic:%5B%22engram%22%2C%22architecture%2Fplugins%22%5D
```

The original project and topic remain available in node metadata. An observation without a project uses its session project when available; otherwise all-project graphs use `unknown-project`.

### Slice metadata

- `totalObservations`: non-deleted, non-global observations received from export.
- `activeCount` and `staleCount`: matching project observations after topic/type filters and before stale observations are excluded from the node set.
- `globalRulesInherited`: global observations that pass filters and lifecycle handling and are included after the global limit.
- `globalRulesTotal`: non-deleted global observations received by the fetch path, not the total stored in Engram.
- `topicsCount`: topic nodes included in the graph.
- `isExhaustive`: false for CLI output unless a TypeScript caller explicitly sets it.
- `generatedAt`: the UTC reference time used for lifecycle evaluation and snapshot metadata.

Relations are fetched from all judged `/conflicts` pages. `not_conflict` relations are excluded by the server. Relation edges are emitted only when both endpoint observations are present. The original relation verb is retained as `metadata.relation`; the endpoint contract does not guarantee judgment evidence, confidence, or explanation fields.

The client rejects changing or incomplete conflict pagination and refuses responses advertising more than 100,000 relations.

## Architecture

```text
Engram HTTP server
        |
        v
services/engram       HTTP transport, validation, project selection
        |
        v
core/assembler        Pure graph construction and local filtering
        |
        +--> JSON graph snapshot
        |
        +--> agent-context Markdown renderer
        |
        v
~/.engram/semantic-graph/*
```

Source layout:

```text
src/
├── types/                # Graph, observation, and Engram entity types
├── services/engram/      # HTTP boundary and response schemas
├── core/                 # Graph assembly, semantic rules, and context renderer
├── cli/                  # CLI entry actions and graph generation
├── config/               # Snapshot paths and filename helpers
├── utils/                # Environment and project helpers
└── index.ts              # CLI entry point and short-flag parser
```

## Validation

```bash
npm run typecheck
npm run build
npm test
```

The package has the `npm test` command configured for `tests/**/*.test.ts`; the dedicated TypeScript test suite is still being built. Current validation for this feature is provided by typecheck, production build, and manual CLI/server smoke tests.

## Planned Extensions

These are not implemented by the current CLI:

- Interactive HTML visualization.
- Mermaid export.
- An official agent skill for consuming the graph.

## License

MIT
