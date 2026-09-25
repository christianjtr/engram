import type { ObservationLifecycle, SessionStatus, TypeMetadata } from "./observation";

export type GraphNodeCategory = "GLOBAL_CONTEXT" | "PROJECT" | "TOPIC" | "OBSERVATION" | "SESSION";

export interface GlobalContextNode {
    id: string;
    category: "GLOBAL_CONTEXT";
    label: string;
    metadata: { scope: "global" };
}

export interface ProjectNode {
    id: string;
    category: "PROJECT";
    label: string;
    metadata: { project: string };
}

export interface TopicNode {
    id: string;
    category: "TOPIC";
    label: string;
    metadata: { topic: string; project: string };
}

export interface ObservationNode {
    id: string;
    category: "OBSERVATION";
    label: string;
    lifecycle?: ObservationLifecycle;
    type?: string;
    scope?: string;
    topic_key?: string;
    content?: string;
    metadata: {
        project: string;
        sync_id: string;
        created_at: string;
        session_id?: string;
    };
}

export interface SessionNode {
    id: string;
    category: "SESSION";
    label: string;
    status?: SessionStatus;
    metadata: { project: string; started_at: string };
}

export type GraphNode = GlobalContextNode | ProjectNode | TopicNode | ObservationNode | SessionNode;

export type GraphEdgeRelation =
    | "INHERITS"
    | "BELONGS_TO"
    | "SUPERSEDES"
    | "CONFLICTS_WITH"
    | "RELATED_TO"
    | "PRODUCED_IN";

export interface StructuralEdge {
    source: string;
    target: string;
    relation: "INHERITS" | "BELONGS_TO" | "PRODUCED_IN";
    reason: string;
}

export interface JudgedEdge {
    source: string;
    target: string;
    relation: "SUPERSEDES" | "CONFLICTS_WITH" | "RELATED_TO";
    reason: string;
    metadata?: { relation: string; judgment_status: string };
}

export type GraphEdge = StructuralEdge | JudgedEdge;

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

export interface GraphBuildOptions {
    all?: boolean;
    referenceDate?: Date;
    globalLimit?: number;
    allGlobals?: boolean;
    includeStale?: boolean;
    includeSessions?: boolean;
    topicFilter?: string;
    typeFilter?: string[];
    isExhaustive?: boolean;
}
