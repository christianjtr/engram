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
        const graph = buildKnowledgeGraph(projectName);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            instructions:
                                "This payload contains the nodes and edges of the project's knowledge graph. You can process this structure to generate visual representations such as Mermaid diagrams (```mermaid ... ```) or DOT charts if requested.",
                            graph,
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
 * 2. Tool: Extract active architectural constraints
 */
server.tool(
    "get_active_constraints",
    "Extracts all nodes classified with the CONSTRAINT reasoning role for a project.",
    {
        projectName: z
            .string()
            .describe("The project name to filter architectural constraints."),
    },
    async ({ projectName }) => {
        const graph = buildKnowledgeGraph(projectName);

        const constraints = graph.nodes.filter(
            (node) => node.value?.reasoning_role === "CONSTRAINT"
        );

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            project: projectName,
                            total_constraints: constraints.length,
                            constraints: constraints.map((c) => ({
                                id: c.v,
                                title: c.value.title || c.value.name,
                                content: c.value.content,
                                type: c.value.type,
                            })),
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
    await server.connect(transport);
    console.error("Engram Semantic Graph MCP Server running on stdio.");
}