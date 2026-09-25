import type { ENGRAM_SCOPES } from "./constants";

/**
 * Raw Engram entity representations coming from Go HTTP endpoints.
 */

export type ScopeType = (typeof ENGRAM_SCOPES)[number];

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
    /** Local SQLite AUTOINCREMENT primary key. Used only for graph node keys (`obs:${id}`). */
    id: number;
    /** Stable UUID used for cross-machine identity and by memory_relations. */
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
    duplicate_count?: number | null;
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
    id: number;
    sync_id: string;
    relation: string;
    judgment_status: string;
    source_id: string;
    source_title: string;
    target_id: string;
    target_title: string;
    created_at: string;
    updated_at: string;
}

export interface EngramExportPayload {
    version: string;
    exported_at: string;
    sessions: EngramSession[];
    observations: EngramObservation[];
    prompts?: EngramPrompt[];
}

export interface EngramProjectSelection {
    project?: string;
    allProjects?: boolean;
}

export interface EngramProjectCurrent {
    project?: string;
    project_source?: string;
    project_path?: string;
    cwd?: string;
    available_projects?: string[] | null;
    warning?: string;
    error_hint?: string;
}
