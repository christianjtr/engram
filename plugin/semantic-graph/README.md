# Engram Semantic Graph

Deterministic semantic knowledge graph engine and CLI for [Engram](https://github.com/Gentleman-Programming/engram).

Reads from the local Engram HTTP server (`http://127.0.0.1:7437`) and assembles a derived graph in TypeScript. It does not access SQLite directly, mutate memories, or require recompiling Go. This is a standalone CLI, not an MCP server.

---

## Core Benefits

- **Relational Context vs. Isolated Search**: Vector search or raw keyword queries return disconnected fragments without provenance. The semantic graph organizes memories into a coherent topological map linking projects, domain topics, architectural decisions, and organizational conventions.
- **Global Context Inheritance**: A bounded selection of `scope: global` observations is attached to the project graph. Personal observations in the selected project retain their scope; cross-project personal inheritance is not implemented.
- **Conflict & Obsolescence Visibility**: Displays persisted, judged superseding and conflicting relationships and marks expired observations using `review_after`. It does not judge new conflicts or enforce which guidance an agent follows.
- **Fast In-Memory Graph Build**: Data is fetched directly from the local Engram HTTP server and the graph is assembled in memory — no temporary files or shell spawns during the build phase. The final graph is then saved to `~/.engram/semantic-graph/` for agent and human consumption.
- **No Go Recompilation**: Requires Node.js, a built CLI, and a running Engram HTTP server; no MCP configuration is needed.

---

## Key Features

- **Project Slicing**: Project-focused by default, with up to 15 inherited global observations selected from the latest 20 fetched. Project observation content is not size-limited; there is no fixed byte or token budget.
- **Topological Hierarchy**: Maps memories into a clear graph structure:
  `GLOBAL_CONTEXT` ➔ `PROJECT` ➔ `TOPIC` ➔ `OBSERVATION`.
- **Dynamic Type Discovery**: Maps observation types received from the API to textual badges (e.g. `[CONVENTION]`, `[DECISION]`, `[ARCHITECTURE]`).
- **Obsolescence Awareness**: Excludes soft-deleted observations and, by default, expired observations. Native SQL timestamps are interpreted as UTC; deadlines at or before the build's reference time are stale.
- **Semantic Relation Mapping**: Traverses all pages of judged `/conflicts` results and emits edges only when both endpoints are present. Original verdicts are retained in edge metadata.
- **Interactive CLI**: Menu-driven terminal runner with support for direct CLI flags and automated exports.

---

## Quick Start

### 1. Requirements
Use Node.js 20.12 or later and npm. The lockfile includes the `tsx` test runner.

Ensure your Engram server is running locally:

```bash
engram serve
```

### 2. Build

```bash
cd plugin/semantic-graph
npm install
npm run build
```

### 3. Run

```bash
# Interactive menu
node dist/semantic-graph.js

# Direct generation (active project + top global rules)
node dist/semantic-graph.js --generate

# All projects, retaining separate project roots (default stale filtering still applies)
node dist/semantic-graph.js --generate --all

# Include expired/stale conventions
node dist/semantic-graph.js --generate --stale

# Target a specific project
node dist/semantic-graph.js --generate --project engram
```

### Project Resolution and Failures

Selection order is `--all`, explicit `--project`, the caller's `ENGRAM_PROJECT`, then `/project/current?cwd=<caller-directory>`. The server applies its own resolver policy, including any server-side project override. Use `--project` when an explicit target is needed.

Ambiguous discovery, HTTP failures, malformed responses, and detected incomplete/changing conflict pagination abort generation instead of producing a misleading empty graph. A failed fetch leaves an existing graph file unchanged. A valid empty response still generates an empty context graph.

`ENGRAM_URL` overrides the server URL; otherwise `ENGRAM_PORT` overrides port 7437. `ENGRAM_HTTP_TOKEN` supplies Bearer authentication. Keep the server on loopback, or use HTTPS when configuring a remote URL.

---

## Output Location

After running `--generate`, the graph is saved to:

```
~/.engram/semantic-graph/
  engram_semantic_graph_<project>.json   # active project graph
  engram_semantic_graph_all.json         # multi-project global graph (--all)
```

AI agents can read these files directly (e.g. via a skill or prompt injection) to reason about conventions, decisions, and architectural rules without querying the database.

These are snapshots, not automatically refreshed context. Re-run generation after memory changes and inspect `slice.generatedAt` before consuming a saved graph. Files contain full observation content, including personal observations within the selected project; treat them as private memory exports.

---

## Output Structure

The graph builder produces nodes, edges, a type catalog, and slice metadata. Abbreviated single-project example:

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
      "label": "PROJECT: engram"
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
      "content": "Adapters in plugin/ must remain thin...",
      "metadata": { "project": "engram" }
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
    "convention": { "type": "convention", "label": "CONVENTION", "color": "#10b981", "isConventionLike": true },
    "decision": { "type": "decision", "label": "DECISION", "color": "#3b82f6", "isConventionLike": true }
  },
  "slice": {
    "project": "engram",
    "totalObservations": 24,
    "activeCount": 22,
    "staleCount": 2,
    "globalRulesInherited": 10,
    "globalRulesTotal": 38,
    "topicsCount": 5,
    "isExhaustive": false,
    "generatedAt": "2026-09-17T17:00:00.000Z"
  }
}
```

In `--all` mode, each represented project has its own `PROJECT` node under `GLOBAL_CONTEXT`. Topic IDs encode `[project, topic]` as a JSON tuple, for example `topic:["engram","architecture/plugins"]`, so equal topic names in different projects do not merge. Single-project topic IDs remain unchanged. Observation and session metadata retain project provenance; missing observation projects are inferred from their session, then the selected project or `unknown-project` in all-project mode.

Inherited globals with no resolvable source project are always marked `unknown-project`, never attributed to the consuming project. Sessions fetched only to resolve global provenance are not rendered as project sessions.

`totalObservations`, `activeCount`, and `staleCount` describe non-deleted project/export observations before topic/type/stale filtering. `globalRulesTotal` counts non-deleted globals fetched, not all globals in the store. `--all` expands project selection but does not claim an exhaustive graph: stale filtering, inherited-global limits, and relation endpoint filtering still apply.

The TypeScript builder also accepts `globalLimit`, `topicFilter`, `typeFilter`, and `includeSessions`; these are not CLI flags. `globalLimit: "all"` requires an all-project export because `/observations` has no pagination. Session nodes are disabled by default.

The `/conflicts` endpoint excludes `not_conflict` verdicts and omits judgment reason/evidence/confidence. Generic edge descriptions are not the original judgment explanation. Other judged verdicts map to `RELATED_TO` while retaining their original verb in `metadata.relation`. Separate HTTP reads are not a transactional database snapshot; re-run if the store changes during generation.

---

## Architecture

Engram remains the source of truth. This plugin owns the derived graph representation, including local filtering and lifecycle display; it does not implement persistence, synchronization, or conflict judgment. That is more than a transport-only adapter. Any future move of shared memory semantics into Go core requires a separate architecture decision.

```
src/
├── types.ts              # Consumed subsets of Engram models and graph types
├── core/
│   ├── client.ts         # HTTP discovery, exports, globals, and paginated judged relations
│   ├── derivations.ts    # Pure lifecycle, status, normalization & type registry helpers
│   ├── builder.ts        # Graph assembly & smart slicing engine
│   └── index.ts          # Core barrel exports
├── cli/
│   ├── actions.ts        # Graph generation & status actions
│   └── runner.ts         # Interactive terminal UI using @clack/prompts
└── index.ts              # CLI entry point
```

---

## Roadmap & Work In Progress (WIP)

We are actively developing the presentation and consumption layer across two primary flanks:

### 1. Interactive Visual Experience (CodeViz / Graphify style)
- **Standalone Interactive HTML Visualizer**: A local browser-based interactive canvas (zoom, pan, search, physics layout, cluster filtering) to inspect project conventions and architectural decisions visually.
- **Direct Mermaid Exporters**: Output formatted Mermaid (`flowchart TD`) diagrams with styled subgraphs and deterministic theme classes for Markdown files and IDE previews.

### 2. Efficient Agent Context Consumption
- **Pruned Agent Context Format (`--format=agent-context`)**: A token-optimized Markdown payload prioritizing active conventions and decisions for LLM decision-making (~300 tokens), omitting historical noise.
- **Accompanying Agent Skill (`skills/semantic-graph`)**: An official Engram agent skill defining the reasoning protocol for AI coding agents to inspect the semantic graph before proposing changes or writing code.

---

## Testing & Quality

```bash
# Core, HTTP contract, pipeline, and isolated CLI regression tests
npm test

# Type check
npm run typecheck

# Production build
npm run build
```

Tests use fixtures rather than the live Engram database. CLI tests run against a temporary local HTTP server and write only to a temporary home directory.

---

## License

MIT
