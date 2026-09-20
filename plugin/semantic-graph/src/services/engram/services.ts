import { engramHttpClient } from "./httpClient";
import {
    ConflictPageSchema,
    EngramExportSchema,
    GlobalObservationsSchema,
    ProjectCurrentSchema,
    parseResponse
} from "./schemas";
import type {
    EngramExportPayload,
    EngramObservation,
    EngramRelation
} from "../../types";

export interface EngramProjectSelection {
    project?: string;
    allProjects?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Ensures pagination parameters match expected offset and limit bounds.
 */
function assertOffsetBounds(offset: number, expectedOffset: number, pageLength: number, limit: number): void {
    if (offset !== expectedOffset || pageLength > limit) {
        throw new Error("Invalid /conflicts pagination offset from Engram server");
    }
}

/**
 * Guarantees total count remains stable and no unexpected empty pages occur during pagination.
 */
function assertSnapshotStability(total: number, expectedTotal: number, currentCount: number, pageLength: number): void {
    const isTotalUnstable = total !== expectedTotal;
    const isOverflowing = currentCount + pageLength > expectedTotal;
    const isPrematureEmptyPage = pageLength === 0 && currentCount < expectedTotal;

    if (isTotalUnstable || isOverflowing || isPrematureEmptyPage) {
        throw new Error("Incomplete or changing /conflicts pagination; retry graph generation");
    }
}

// ─── Service Operations ──────────────────────────────────────────────────────

/**
 * Resolves the active project name for the caller's working directory.
 */
export async function resolveCurrentProject(): Promise<string> {
    const rawData = await engramHttpClient.get("/project/current", { cwd: process.cwd() });
    const { project, error_hint } = parseResponse(ProjectCurrentSchema, rawData, "/project/current");

    if (error_hint || !project) {
        throw new Error(`Project discovery failed: ${error_hint || "no project resolved"}. Use -p <name>.`);
    }

    return project;
}

/**
 * Fetches exported observations, sessions, and prompts for a specific project or all projects.
 */
export async function fetchExport(options?: EngramProjectSelection): Promise<EngramExportPayload> {
    const params = {
        ...(options?.allProjects && { all_projects: true }),
        ...(!options?.allProjects && options?.project && { project: options.project }),
    };

    const rawData = await engramHttpClient.get("/export", params);
    return parseResponse(EngramExportSchema, rawData, "/export");
}

/**
 * Fetches globally scoped observations across all projects, sorted by creation date descending.
 */
export async function fetchGlobalObservations(limit = 20): Promise<EngramObservation[]> {
    if (!Number.isSafeInteger(limit) || limit < 0) {
        throw new Error("Global observation limit must be a non-negative integer");
    }
    if (limit === 0) return [];

    const rawData = await engramHttpClient.get("/observations", {
        all_projects: true,
        scope: "global",
        limit,
        sort: "created_at:desc",
    });

    return parseResponse(GlobalObservationsSchema, rawData, "/observations");
}

/**
 * Traverses all pages of judged relations exposed by /conflicts while validating snapshot integrity.
 */
export async function fetchConflicts(options?: EngramProjectSelection): Promise<EngramRelation[]> {
    const conflictsMap = new Map<string, EngramRelation>();
    let expectedTotal: number | undefined;

    while (expectedTotal === undefined || conflictsMap.size < expectedTotal) {
        const rawData = await engramHttpClient.get("/conflicts", {
            project: options?.allProjects ? undefined : options?.project,
            all_projects: options?.allProjects || undefined,
            status: "judged",
            limit: 500,
            offset: conflictsMap.size,
        });

        const { relations: page, total, limit, offset } = parseResponse(ConflictPageSchema, rawData, "/conflicts");

        expectedTotal ??= total;

        assertOffsetBounds(offset, conflictsMap.size, page.length, limit);
        assertSnapshotStability(total, expectedTotal, conflictsMap.size, page.length);

        // Detect overlapping keys before inserting to ensure snapshot stability
        if (page.some((rel) => conflictsMap.has(rel.sync_id))) {
            throw new Error("Changing /conflicts pagination; retry graph generation");
        }

        page.forEach((rel) => conflictsMap.set(rel.sync_id, rel));
    }

    return Array.from(conflictsMap.values());
}