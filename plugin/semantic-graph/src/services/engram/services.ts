import { DEFAULT_GLOBAL_LIMIT, MAX_CONFLICT_RELATIONS } from "../../config";
import { engramHttpClient } from "./httpClient";
import {
    ConflictPageSchema,
    EngramExportSchema,
    GlobalObservationsSchema,
    ProjectCurrentSchema,
    parseResponse,
} from "./schemas";
import type {
    EngramExportPayload,
    EngramObservation,
    EngramProjectSelection,
    EngramRelation,
} from "./types";

const ENGRAM_ENDPOINTS = {
    PROJECT_CURRENT: "/project/current",
    EXPORT: "/export",
    OBSERVATIONS: "/observations",
    CONFLICTS: "/conflicts",
} as const;

export async function getCurrentProjectName(): Promise<string> {
    const envProjectName = process.env.ENGRAM_PROJECT?.trim();
    if (envProjectName) return envProjectName;

    const endpoint = ENGRAM_ENDPOINTS.PROJECT_CURRENT;
    const rawData = await engramHttpClient.get(endpoint, { cwd: process.cwd() });
    const { project, error_hint } = parseResponse(
        ProjectCurrentSchema,
        rawData,
        endpoint,
    );

    if (error_hint || !project) {
        throw new Error(
            `Project discovery failed: ${error_hint || "no project resolved"}. Set ENGRAM_PROJECT or run from a project directory.`,
        );
    }

    return project;
}

export async function fetchExport(options?: EngramProjectSelection): Promise<EngramExportPayload> {
    const params = {
        project: options?.allProjects ? undefined : options?.project,
        all_projects: options?.allProjects || undefined,
    };

    const endpoint = ENGRAM_ENDPOINTS.EXPORT;
    const rawData = await engramHttpClient.get(endpoint, params);

    return parseResponse(EngramExportSchema, rawData, endpoint);
}

export async function fetchGlobalObservations(
    limit = DEFAULT_GLOBAL_LIMIT,
): Promise<EngramObservation[]> {
    if (!Number.isSafeInteger(limit) || limit < 0) {
        throw new Error("Global observation limit must be a non-negative integer");
    }

    if (limit === 0) return [];

    const endpoint = ENGRAM_ENDPOINTS.OBSERVATIONS;
    const rawData = await engramHttpClient.get(endpoint, {
        all_projects: true,
        scope: "global",
        limit,
        sort: "created_at:desc",
    });

    return parseResponse(GlobalObservationsSchema, rawData, endpoint);
}

export async function fetchConflicts(options?: EngramProjectSelection): Promise<EngramRelation[]> {
    const relations: EngramRelation[] = [];
    let offset = 0;
    let initialTotal: number | undefined;

    const RELATION_STATUS = "judged";
    const CONFLICTS_PAGE_SIZE = 500;
    const endpoint = ENGRAM_ENDPOINTS.CONFLICTS;

    while (true) {
        const rawData = await engramHttpClient.get(endpoint, {
            project: options?.allProjects ? undefined : options?.project,
            all_projects: options?.allProjects || undefined,
            status: RELATION_STATUS,
            limit: CONFLICTS_PAGE_SIZE,
            offset,
        });

        const { relations: page, total } = parseResponse(ConflictPageSchema, rawData, endpoint);

        if (total > MAX_CONFLICT_RELATIONS) {
            throw new Error(
                `Engram server returned too many conflict relations (maximum ${MAX_CONFLICT_RELATIONS})`,
            );
        }

        if (initialTotal === undefined) {
            initialTotal = total;
        } else if (total !== initialTotal) {
            throw new Error("Conflict relations total changed during pagination; please retry");
        }

        if (page.length === 0) {
            if (relations.length < total) {
                throw new Error(
                    `Incomplete conflict pagination: received ${relations.length} relations but expected ${total}`,
                );
            }
            break;
        }

        relations.push(...page);
        offset += page.length;

        if (relations.length >= total) break;
    }

    return relations;
}