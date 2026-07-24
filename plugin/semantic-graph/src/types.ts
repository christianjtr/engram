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