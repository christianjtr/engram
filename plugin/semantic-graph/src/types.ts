/**
 * Cognitive reasoning roles assigned to graph nodes for AI agents.
 */
export type ReasoningRole = "CONSTRAINT" | "FACT" | "HISTORICAL_RECORD";

/**
 * Hierarchical levels for structural data mapping in the graph.
 * 0: Project, 1: Session, 2: Observation
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