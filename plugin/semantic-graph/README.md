# Engram Semantic Graph

Standalone TypeScript CLI that reads Engram memory data through the local HTTP server and writes a complete semantic graph snapshot as JSON. Engram remains the source of truth: this package does not access SQLite, mutate memories, judge conflicts, or run synchronization.

## What It Provides

- Project-scoped graphs by default, or a combined all-project graph.
- A bounded global context: the default includes up to 15 global observations (configurable via `--globals=<n>`).
- Filtering of deleted observations and, by default, stale observations.
- Strict UTC lifecycle handling for `review_after`; a timestamp at or before the build reference time is stale.
- Project, topic, observation, and optional session nodes connected with typed edges.
- Persisted judged relations from `/conflicts`, including `SUPERSEDES`, `CONFLICTS_WITH`, or `RELATED_TO` edges when both endpoints are present.
- Schema validation for HTTP responses with Zod.
- Atomic publication through unique temporary files and rename.

## Requirements

- Node.js 20.12 or later
- npm
- A running Engram HTTP server

Start the local server:

```bash
engram serve
```

The default server URL is `http://127.0.0.1:7437`. Before generating a graph the CLI probes `GET /health` and requires `{ "status": "ok", "service": "engram" }`. `--help` skips this check.

## Build and Run

```bash
cd plugin/semantic-graph
npm install
npm run build
```

The production bundle is written to `dist/semantic-graph.js`.

The CLI is intentionally non-interactive. Every invocation either prints help or generates a graph.

### CLI flags

| Flag            | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| _(none)_        | Current project, 15 globals, stale observations off  |
| `-a`            | Generate one graph containing all projects           |
| `-s`            | Include stale observations                           |
| `--globals`     | Include all global observations                      |
| `--globals=<n>` | Limit global observations                            |
| `-h`, `--help`  | Print help (skips env loading and the health probe)  |

`--globals` and `--globals=<n>` cannot be combined.

Examples:

```bash
npm start
npm start -- -s --globals=20
npm start -- --globals
npm start -- -a
```

Unknown, duplicate, and positional arguments are rejected.

## Project Resolution

For project-scoped generation, resolution follows this order:

1. `-a` selects all projects.
2. `ENGRAM_PROJECT` selects the project from the environment.
3. The CLI asks `/project/current?cwd=<caller-directory>` for Engram's canonical resolution.

The server may apply its own project resolver policy.

## Server Configuration

| Variable            | Default                 | Purpose                                 |
| ------------------- | ----------------------- | --------------------------------------- |
| `ENGRAM_URL`        | `http://127.0.0.1:7437` | Complete server base URL                |
| `ENGRAM_PORT`       | `7437`                  | Port used when `ENGRAM_URL` is not set  |
| `ENGRAM_HTTP_TOKEN` | unset                   | Bearer token for authenticated requests |
| `ENGRAM_PROJECT`    | unset                   | Project override used during discovery  |

Values are read in this order (first set wins):

1. Process environment
2. `.env` in the current working directory
3. `~/.engram/semantic-graph/.env`

Copy `.env.example` to either location. Only the variables above are applied; unknown keys are ignored.

Requests use a 10-second timeout by default. The pre-flight health probe uses a 1.5-second timeout. Keep the server on loopback, or use HTTPS before configuring a remote URL with an authentication token. If the daemon is down, the CLI exits and tells you to run `engram serve`.

## Output

Snapshots are saved under:

```text
~/.engram/semantic-graph/
  engram_semantic_graph_<project>.json
  engram_semantic_graph_all.json
```

Project names are trimmed and path separators are replaced with `_` for filenames. The JSON contains full observation content, including personal observations within the selected project. Treat it as a private memory export.

Generation failures leave the existing snapshot unchanged when the failure occurs before publication. Separate HTTP requests are not one transactional database snapshot; regenerate if the store changes during generation.

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
core/graph            Pure graph construction and local filtering
        |
        v
~/.engram/semantic-graph/*.json
```

Source layout:

```text
src/
├── types/                # Graph, observation, and Engram entity types
├── services/engram/      # HTTP boundary and response schemas
├── core/                 # Graph assembly and semantic rules
├── cli/                  # CLI flags, preflight, and graph generation
├── config/               # Snapshot paths, env loader, and limits
├── utils/                # Filesystem helpers
└── index.ts              # CLI entry point
```

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Planned Extensions

These are not implemented yet:

- Mermaid export.
- An official agent skill for consuming the graph.

## License

MIT
