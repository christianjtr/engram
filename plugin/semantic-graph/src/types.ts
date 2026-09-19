/**
 * Core type definitions for Engram Semantic Graph.
 * Models describe the consumed fields of Engram's Go HTTP payloads, not full store rows.
 * Output and labels are strictly in English. No icons or emojis are used for types.
 */

// ─── Native Engram Entities ──────────────────────────────────────────────────

export interface EngramObservation {
    id: number;
    sync_id: string;
    session_id: string;
    type: string;
    title: string;
    content: string;
    tool_name?: string | null;
    project?: string | null;
    scope: "project" | "global" | "personal";
    topic_key?: string | null;
    revision_count: number;
    duplicate_count?: number;
    last_seen_at?: string | null;
    review_after?: string | null;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
}

export interface EngramSession {
    id: string;
    project: string;
    ownership_mode?: string;
    directory: string;
    started_at: string;
    ended_at?: string | null;
    summary?: string | null;
}

export interface EngramRelation {
    sync_id: string;
    source_id: string;
    target_id: string;
    relation: "supersedes" | "conflicts_with" | "related" | "compatible" | "scoped" | "not_conflict" | string;
    // The HTTP list omits these judgment details; direct builder callers may supply them.
    reason?: string;
    evidence?: string;
    confidence?: number;
    judgment_status: "pending" | "judged" | "orphaned" | "ignored" | string;
}

export interface EngramExportPayload {
    version: string;
    exported_at: string;
    sessions: EngramSession[];
    observations: EngramObservation[];
    prompts?: Array<{
        id: number;
        sync_id: string;
        session_id: string;
        content: string;
        project?: string;
        created_at: string;
    }>;
}

// ─── Observation Lifecycle & Session Status ──────────────────────────────────

export type ObservationLifecycle = "active" | "stale";
export type SessionStatus = "active" | "completed" | "interrupted";

// ─── Extensible Observation Types ────────────────────────────────────────────

export const STANDARD_OBSERVATION_TYPES = [
    "convention",
    "decision",
    "architecture",
    "pattern",
    "config",
    "bugfix",
    "discovery",
    "learning",
] as const;

export type StandardObservationType = (typeof STANDARD_OBSERVATION_TYPES)[number];

/**
 * Open union allowing standard autocomplete while safely accepting any custom DB type string.
 */
export type ObservationType = StandardObservationType | (string & {});

export interface TypeMetadata {
    type: string;
    label: string;             // Clean uppercase textual badge (e.g. "CONVENTION", "DECISION")
    color: string;             // Color hex code for visual renderers
    isConventionLike: boolean; // Indicates rules, constraints, and architecture decisions
}

// ─── Semantic Graph Structures ───────────────────────────────────────────────

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
