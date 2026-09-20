import type { ObservationLifecycle, SessionStatus, TypeMetadata } from "./observation";

// ─── Semantic Graph Nodes & Edges ───────────────────────────────────────────

export type GraphNodeCategory =
    | "GLOBAL_CONTEXT"
    | "PROJECT"
    | "TOPIC"
    | "OBSERVATION"
    | "SESSION";

export interface GraphNode {
    id: string;
    category: GraphNodeCategory;
    label: string;
    lifecycle?: ObservationLifecycle;
    status?: SessionStatus;
    type?: string;
    scope?: string;
    topic_key?: string;
    content?: string;
    metadata?: Record<string, unknown>;
}

export type GraphEdgeRelation =
    | "INHERITS"
    | "BELONGS_TO"
    | "SUPERSEDES"
    | "CONFLICTS_WITH"
    | "RELATED_TO"
    | "PRODUCED_IN";

export interface GraphEdge {
    source: string;
    target: string;
    relation: GraphEdgeRelation;
    reason?: string;
    metadata?: Record<string, unknown>;
}

export interface SliceMetadata {
    project: string;
    totalObservations: number;
    activeCount: number;
    staleCount: number;
    globalRulesInherited: number;
    globalRulesTotal: number;
    topicsCount: number;
    isExhaustive: boolean;
    generatedAt: string;
}

export interface SemanticGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    types: Record<string, TypeMetadata>;
    slice: SliceMetadata;
}

// ─── Graph Build Options & App Configuration ────────────────────────────────

export interface GraphBuildOptions {
    project?: string;
    all?: boolean;
    globalLimit?: number | "all";
    includeStale?: boolean;
    includeSessions?: boolean;
    topicFilter?: string;
    typeFilter?: string[];
    isExhaustive?: boolean;
}

export interface SemanticGraphConfig {
    category_exclusions?: string[];
}