#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { buildKnowledgeGraph } from "../core/builder";

// Instantiate the MCP Server
const server = new McpServer({
    name: "engram-semantic-graph-mcp",
    version: "1.0.0",
});

/**
 * 1. Tool: Retrieve full knowledge graph structure
 */
server.tool(
    "get_project_graph",
    "Retrieves the raw Graphlib knowledge graph structure for a specified project or 'all'. AI models can use this payload to generate visual representations like Mermaid diagrams (flowchart TD/graph LR) or DOT charts upon user request.",
    {
        projectName: z
            .string()
            .describe("The target project name (e.g., 'my-project', 'workspace-a', or 'all')."),
    },
    async ({ projectName }) => {
        const result = buildKnowledgeGraph(projectName);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            instructions: [
                                "This payload has three independent blocks — consume only what the task requires:",
                                "  • summary  — pre-computed counts and last_activity. Use this first for fast orientation.",
                                "  • timeline — sessions ordered chronologically (oldest first), each with grouped observations.",
                                "  • graph    — full Graphlib JSON for relational or visual analysis (Mermaid / DOT).",
                                "If context window is limited, rely on 'summary' only and skip 'graph'.",
                                "",
                                "--- SESSION STATUS ---",
                                "Each session node carries a 'status' field. Three possible values:",
                                "  active      — session is still open (ended_at absent). Always included in the graph.",
                                "  completed   — session ended with a summary (ended_at + summary both present).",
                                "  interrupted — session ended without a summary (ended_at present, summary absent).",
                                "",
                                "--- OBSERVATION STALENESS ---",
                                "Each observation node carries 'is_stale: boolean'.",
                                "  true  — review_after date has passed; observation may need revisiting.",
                                "  false — observation is current.",
                                "",
                                "--- MERMAID RENDERING RULES ---",
                                "When generating a Mermaid diagram, apply these classDef styles:",
                                "",
                                "  classDef sessionActive      fill:#3b82f6,stroke:#1d4ed8,color:#fff",
                                "  classDef sessionCompleted   fill:#22c55e,stroke:#15803d,color:#fff",
                                "  classDef sessionInterrupted fill:#f59e0b,stroke:#b45309,color:#fff",
                                "  classDef obsStale           fill:#ef4444,stroke:#b91c1c,color:#fff",
                                "  classDef project            fill:#8b5cf6,stroke:#6d28d9,color:#fff",
                                "",
                                "Apply class to each node based on its status/is_stale:",
                                "  SESSION nodes:     class nodeId sessionActive | sessionCompleted | sessionInterrupted",
                                "  OBSERVATION nodes: class nodeId obsStale  (only when is_stale: true)",
                                "  PROJECT nodes:     class nodeId project",
                                "",
                                "Timeline diagram example (flowchart TD, oldest session at top):",
                                "  Use 'timeline' block to order sessions. Label each session node with:",
                                "    [🔄 Session X\\nN observations]  for active",
                                "    [✅ Session X\\nN observations]  for completed",
                                "    [⚠️ Session X\\nN observations]  for interrupted",
                                "  Connect each session to its observations with -->.",
                                "  Flag stale observations with a (⚠️ stale) label suffix.",
                            ].join("\n"),
                            summary: result.summary,
                            timeline: result.timeline,
                            graph: result.graph,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }
);

/**
 * Exportable runner function for the entry point
 */
export async function startMcpServer(): Promise<void> {
    const transport = new StdioServerTransport();

    // Handling graceful shutdown
    process.on("SIGINT", async () => {
        console.error("Shutting down MCP server...");
        await server.close();
        process.exit(0);
    });

    await server.connect(transport);
    console.error("Engram Semantic Graph MCP Server running on stdio.");
}
