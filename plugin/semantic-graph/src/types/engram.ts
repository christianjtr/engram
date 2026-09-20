/**
 * Raw Engram entity representations coming from Go HTTP endpoints.
 */

export type ScopeType = "project" | "global" | "personal";

export type EngramRelationType =
    | "supersedes"
    | "conflicts_with"
    | "related"
    | "compatible"
    | "scoped"
    | "not_conflict"
    | (string & {});

export type JudgmentStatus = "pending" | "judged" | "orphaned" | "ignored" | (string & {});

export interface EngramObservation {
    id: number;
    sync_id: string;
    session_id: string;
    type: string;
    title: string;
    content: string;
    tool_name?: string | null;
    project?: string | null;
    scope: ScopeType;
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

export interface EngramPrompt {
    id: number;
    sync_id: string;
    session_id: string;
    content: string;
    project?: string;
    created_at: string;
}

export interface EngramRelation {
    sync_id: string;
    source_id: string;
    target_id: string;
    relation: EngramRelationType;
    reason?: string;
    evidence?: string;
    confidence?: number;
    judgment_status: JudgmentStatus;
}

export interface EngramExportPayload {
    version: string;
    exported_at: string;
    sessions: EngramSession[];
    observations: EngramObservation[];
    prompts?: EngramPrompt[];
}