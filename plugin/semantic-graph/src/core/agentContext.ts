import type { GraphEdge, GraphNode, SemanticGraph } from "../types";
import {
    DEFAULT_MAX_CHARS,
    DEFAULT_MAX_OBSERVATIONS,
    MAX_OBSERVATION_CONTENT_CHARS,
    OBSERVATION_PRIORITY,
} from "./agentContextConstants";

export interface AgentContextRenderOptions {
    maxChars?: number;
    maxObservations?: number;
    sourceGraph?: string;
}

function normalizeText(value: unknown): string {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getProject(node: GraphNode): string {
    return normalizeText(node.metadata?.project) || "unknown-project";
}

function getCreatedAt(node: GraphNode): string {
    return normalizeText(node.metadata?.created_at);
}

function observationSortKey(node: GraphNode): [number, number, string, string] {
    const typePriority = OBSERVATION_PRIORITY[node.type ?? "other"] ?? OBSERVATION_PRIORITY.other;
    const projectPriority = getProject(node) === "unknown-project" ? 1 : 0;
    return [typePriority, projectPriority, getCreatedAt(node), node.id];
}

function compareObservations(left: GraphNode, right: GraphNode): number {
    const leftKey = observationSortKey(left);
    const rightKey = observationSortKey(right);

    for (let index = 0; index < leftKey.length; index++) {
        if (leftKey[index] < rightKey[index]) return -1;
        if (leftKey[index] > rightKey[index]) return 1;
    }
    return 0;
}

function formatObservation(node: GraphNode): string {
    const fullContent = normalizeText(node.content) || normalizeText(node.label);
    const content = fullContent.length > MAX_OBSERVATION_CONTENT_CHARS
        ? `${fullContent.slice(0, MAX_OBSERVATION_CONTENT_CHARS - 3)}...`
        : fullContent;
    const topic = normalizeText(node.topic_key) || "general";
    const project = getProject(node);
    const lifecycle = node.lifecycle ? ` lifecycle: ${node.lifecycle}` : "";

    return `- [${node.type ?? "other"}] ${content}\n  topic: ${topic}\n  project: ${project}\n  observation: ${node.id}${lifecycle}`;
}

function formatRelation(edge: GraphEdge): string {
    const relation = normalizeText(edge.metadata?.relation) || edge.relation;
    return `- ${edge.source} ${relation} ${edge.target}`;
}

function createFrontMatter(graph: SemanticGraph, sourceGraph: string): string {
    return [
        "---",
        "format: engram-agent-context",
        "version: 1",
        `project: ${graph.slice.project}`,
        `generated_at: ${graph.slice.generatedAt}`,
        `source_graph: ${sourceGraph}`,
        `exhaustive: ${graph.slice.isExhaustive}`,
        "---",
        "",
    ].join("\n");
}

function createWarnings(graph: SemanticGraph, omittedCount: number): string[] {
    const warnings: string[] = [];
    if (graph.slice.staleCount > 0) {
        warnings.push(`- ${graph.slice.staleCount} project observations require review.`);
    }
    if (!graph.slice.isExhaustive) {
        warnings.push("- This is a bounded snapshot and may omit historical observations.");
    }
    if (omittedCount > 0) {
        warnings.push(`- ${omittedCount} observations were omitted from the compact context; consult the full JSON snapshot.`);
    }
    return warnings;
}

function groupObservations(observations: GraphNode[]): Map<string, GraphNode[]> {
    const grouped = new Map<string, GraphNode[]>();
    for (const observation of observations) {
        const group = observation.type === "decision"
            ? "Active Decisions"
            : observation.type === "architecture"
                ? "Architecture Context"
                : observation.type === "convention" || observation.type === "pattern"
                    ? "Active Conventions"
                    : "Other Active Memory";
        const groupObservations = grouped.get(group) ?? [];
        groupObservations.push(observation);
        grouped.set(group, groupObservations);
    }
    return grouped;
}

function buildRelationSection(edges: GraphEdge[]): string[] {
    return edges.map(formatRelation).flatMap((line) => [line, ""]);
}

function applyTruncation(frontMatter: string, body: string, maxChars: number): string {
    const truncationWarning = "\n## Warnings\n\n- Context truncated; consult the full JSON snapshot for omitted observations.\n";
    const availableBodyLength = Math.max(0, maxChars - frontMatter.length - truncationWarning.length);
    return `${frontMatter}${body.slice(0, availableBodyLength).trimEnd()}\n${truncationWarning}`.slice(0, maxChars);
}

export function renderAgentContext(
    graph: SemanticGraph,
    options: AgentContextRenderOptions = {},
): string {
    const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    const maxObservations = options.maxObservations ?? DEFAULT_MAX_OBSERVATIONS;
    if (!Number.isSafeInteger(maxChars) || maxChars < 1) {
        throw new Error("Agent context maxChars must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maxObservations) || maxObservations < 1) {
        throw new Error("Agent context maxObservations must be a positive safe integer");
    }

    const sourceGraph = options.sourceGraph ?? `engram_semantic_graph_${graph.slice.project}.json`;
    const observations = graph.nodes
        .filter((node) => node.category === "OBSERVATION" && node.lifecycle !== "stale")
        .sort(compareObservations);
    const selectedObservations = observations.slice(0, maxObservations);
    const omittedCount = Math.max(0, observations.length - selectedObservations.length);
    const grouped = groupObservations(selectedObservations);

    const sections = [
        "# Engram Agent Context",
        "",
        ...Array.from(grouped.entries()).flatMap(([title, nodes]) => [
            `## ${title}`,
            "",
            ...nodes.flatMap((node) => [formatObservation(node), ""]),
        ]),
    ];

    const selectedObservationIds = new Set(selectedObservations.map((observation) => observation.id));
    const relationEdges = graph.edges.filter((edge) =>
        (edge.relation === "SUPERSEDES" || edge.relation === "CONFLICTS_WITH") &&
        selectedObservationIds.has(edge.source) &&
        selectedObservationIds.has(edge.target)
    );
    if (relationEdges.length > 0) {
        sections.push("## Relations", "", ...buildRelationSection(relationEdges));
    }

    const warnings = createWarnings(graph, omittedCount);
    if (warnings.length > 0) sections.push("## Warnings", "", ...warnings, "");

    const frontMatter = createFrontMatter(graph, sourceGraph);
    const body = sections.join("\n");
    if (frontMatter.length + body.length <= maxChars) return `${frontMatter}${body}`;

    return applyTruncation(frontMatter, body, maxChars);
}
