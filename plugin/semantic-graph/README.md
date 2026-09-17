# Engram Semantic Graph

Deterministic semantic knowledge graph engine and CLI for [Engram](https://github.com/Gentleman-Programming/engram).

Connects directly in-memory to the local Engram daemon (`http://127.0.0.1:7437`) using a thin adapter pattern, mirroring the architecture of [`plugin/obsidian`](../obsidian) and [`plugin/pi`](../pi). Does not require recompiling Go and requires zero external MCP configuration.

---

## Key Features

- **Smart Slicing**: Project-focused by default + inherited global organizational conventions (`GLOBAL_CONTEXT`). Fast, light (<50KB), and token-efficient.
- **Topological Hierarchy**: Maps memories into a clear graph structure:
  `GLOBAL_CONTEXT` ➔ `PROJECT` ➔ `TOPIC` ➔ `OBSERVATION`.
- **Dynamic Type Discovery**: Automatically discovers any custom observation types stored in SQLite and maps them to clean textual badges (e.g. `[CONVENTION]`, `[DECISION]`, `[ARCHITECTURE]`) without emojis or icons.
- **Obsolescence Awareness**: Distinguishes between active and expired (`stale`) conventions via `review_after` lifecycle tracking.
- **Semantic Relation Mapping**: Surfaces `SUPERSEDES`, `CONFLICTS_WITH`, and `RELATED_TO` edges from Engram's `memory_relations` judgments.
- **Interactive CLI**: Menu-driven terminal runner with support for direct CLI flags and automated exports.

---

## Quick Start

### 1. Requirements
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

# Full store generation (all projects and history)
node dist/semantic-graph.js --generate --all

# Include expired/stale conventions
node dist/semantic-graph.js --generate --stale

# Target a specific project
node dist/semantic-graph.js --generate --project engram
```

---

## Output Structure

The graph builder produces an enriched JSON structure containing nodes, edges, type catalog, and slice metadata:

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

---

## Architecture

Follows Engram's thin adapter rules:

```
src/
├── types.ts              # 1:1 schema alignment with Engram Go models & graph types
├── core/
│   ├── client.ts         # In-memory HTTP client (:7437 /export, /observations, /conflicts)
│   ├── derivations.ts    # Pure lifecycle, status, normalization & type registry helpers
│   ├── builder.ts        # Graph assembly & smart slicing engine
│   └── index.ts          # Core barrel exports
├── cli/
│   ├── actions.ts        # Graph generation & status actions
│   └── runner.ts         # Interactive terminal UI using @clack/prompts
└── index.ts              # CLI entry point
```

---

## Testing & Quality

```bash
# Run unit test suite (18 tests covering derivations, builder, and slicing)
npm test

# Type check
npm run typecheck

# Production build
npm run build
```

---

## License

MIT
