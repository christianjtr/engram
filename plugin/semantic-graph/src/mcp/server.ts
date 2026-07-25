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
                                "",
                                "Session status rendering:",
                                "  • status: 'active'      → 🔄  (session still open, no ended_at)",
                                "  • status: 'completed'   → ✅  (ended_at + summary present)",
                                "  • status: 'interrupted' → ⚠️  (ended_at present but no summary)",
                                "",
                                "Observation staleness:",
                                "  • is_stale: true → highlight in orange/red in Mermaid or flag in summaries.",
                                "    (review_after date has passed — observation may need revisiting)",
                                "",
                                "If context window is limited, rely on 'summary' only and skip 'graph'.",
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
