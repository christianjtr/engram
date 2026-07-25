/**
 * Cognitive reasoning roles assigned to graph nodes for AI agents.
 */
export type ReasoningRole = "CONSTRAINT" | "FACT" | "HISTORICAL_RECORD";

/**
 * Hierarchical levels for structural data mapping in the graph.
 *   0 — Project scope   (PROJECT nodes, including the synthetic GLOBAL_CONTEXT root)
 *   1 — Session scope   (SESSION nodes)
 *   2 — Observation scope (OBSERVATION nodes, including synthetic TOPIC_CLUSTER nodes)
 *
 * Synthetic nodes reuse existing levels and are differentiated by the `type` field:
 *   - GLOBAL_CONTEXT root: category="PROJECT", type="global_context", is_synthetic=true
 *   - Topic cluster:       category="OBSERVATION", type="topic_cluster", is_synthetic=true
 */
export type NodeLevel = 0 | 1 | 2;

export const NODE_LEVEL_MAP = {
    PROJECT: 0 as NodeLevel,
    SESSION: 1 as NodeLevel,
    OBSERVATION: 2 as NodeLevel,
} as const;

/**
 * Mappings for categorizing node types into cognitive reasoning roles.
 */
export interface ReasoningRoleMappings {
    constraint_types?: string[];
    history_types?: string[];
}

/**
 * Simplified configuration interface for the semantic graph generator.
 */
export interface SemanticGraphConfig {
    category_exclusions?: string[];
    reasoning_mappings?: ReasoningRoleMappings;
}

/**
 * Native Graphlib JSON export schema structure.
 */
export interface GraphLibJsonOptions {
    directed: boolean;
    multigraph: boolean;
    compound: boolean;
}

export interface GraphLibNode {
    v: string;
    value: Record<string, unknown>;
}

export interface GraphLibEdge {
    v: string;
    w: string;
    name?: string;
    value: Record<string, unknown>;
}

export interface GraphLibJson {
    options: GraphLibJsonOptions;
    nodes: GraphLibNode[];
    edges: GraphLibEdge[];
}

/**
 * Status of a session derived from ended_at and summary fields.
 *   active      — ended_at is absent/null (session still open)
 *   completed   — ended_at present AND summary present
 *   interrupted — ended_at present but summary absent/null
 */
export type SessionStatus = "active" | "completed" | "interrupted";

/**
 * Lightweight observation shape used inside the timeline block.
 * Avoids duplicating the full raw row — only fields useful for orientation.
 */
export interface TimelineObservation {
    id: unknown;
    sync_id: unknown;
    type: unknown;
    title: unknown;
    scope: unknown;
    topic_key: unknown;
    is_stale: boolean;
    created_at: unknown;
}

/**
 * A single session entry in the chronological timeline block.
 */
export interface TimelineSession {
    session_id: string;
    project: string;
    status: SessionStatus;
    started_at: string;
    ended_at: string | null;
    observation_count: number;
    observations: TimelineObservation[];
}

/**
 * Pre-computed project summary — allows agents to orient quickly
 * without processing the full graph payload.
 */
export interface ProjectSummary {
    total_sessions: number;
    active_sessions: number;
    completed_sessions: number;
    interrupted_sessions: number;
    total_observations: number;
    stale_observations: number;
    graph_node_count: number;
    graph_edge_count: number;
    last_activity: string | null;
}

/**
 * Enriched payload returned by buildKnowledgeGraph.
 * Three independent blocks — agents can consume only what they need:
 *   summary  — fast orientation (counts, last activity)
 *   timeline — chronological session + observation grouping
 *   graph    — full Graphlib JSON for relational/visual analysis
 */
export interface EnrichedGraphPayload {
    summary: ProjectSummary;
    timeline: TimelineSession[];
    graph: GraphLibJson;
}