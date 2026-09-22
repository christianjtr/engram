import { z } from "zod";
import { ENGRAM_SCOPES } from "./constants";
import type {
    EngramExportPayload,
    EngramObservation,
    EngramProjectCurrent,
    EngramPrompt,
    EngramRelation,
    EngramSession,
    ScopeType,
} from "./types";

const ScopeTypeSchema = z.enum(ENGRAM_SCOPES) satisfies z.ZodType<ScopeType>;

const ObservationSchema = z.object({
    id: z.number().int(),
    sync_id: z.string(),
    session_id: z.string(),
    type: z.string(),
    title: z.string(),
    content: z.string(),
    tool_name: z.string().nullish(),
    project: z.string().nullish(),
    scope: ScopeTypeSchema,
    topic_key: z.string().nullish(),
    revision_count: z.number().int(),
    duplicate_count: z.number().int().nullish(),
    last_seen_at: z.string().nullish(),
    review_after: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().nullish(),
}) satisfies z.ZodType<EngramObservation>;

const SessionSchema = z.object({
    id: z.string(),
    project: z.string(),
    ownership_mode: z.string().optional(),
    directory: z.string(),
    started_at: z.string(),
    ended_at: z.string().nullish(),
    summary: z.string().nullish(),
}) satisfies z.ZodType<EngramSession>;

const PromptSchema = z.object({
    id: z.number().int(),
    sync_id: z.string(),
    session_id: z.string(),
    content: z.string(),
    project: z.string().optional(),
    created_at: z.string(),
}) satisfies z.ZodType<EngramPrompt>;

export const EngramExportSchema = z.object({
    version: z.string(),
    exported_at: z.string(),
    observations: z.array(ObservationSchema).nullish().transform((val) => val ?? []),
    sessions: z.array(SessionSchema).nullish().transform((val) => val ?? []),
    prompts: z.array(PromptSchema).nullish().transform((val) => val ?? []),
}) satisfies z.ZodType<EngramExportPayload>;

const JudgedRelationSchema = z.object({
    id: z.number().int(),
    sync_id: z.string().min(1),
    relation: z.string().min(1),
    judgment_status: z.string().min(1),
    source_id: z.string().min(1),
    source_title: z.string(),
    target_id: z.string().min(1),
    target_title: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
}) satisfies z.ZodType<EngramRelation>;

export const ConflictPageSchema = z.object({
    relations: z.array(JudgedRelationSchema).nullish().transform((val) => val ?? []),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
});

export const ProjectCurrentSchema = z.object({
    project: z.string().optional(),
    project_source: z.string().optional(),
    project_path: z.string().optional(),
    cwd: z.string().optional(),
    available_projects: z.array(z.string()).nullish(),
    warning: z.string().optional(),
    error_hint: z.string().optional(),
}) satisfies z.ZodType<EngramProjectCurrent>;

export const GlobalObservationsSchema = z.array(ObservationSchema).nullish().transform((val) => val ?? []) satisfies z.ZodType<EngramObservation[]>;

export function parseResponse<T>(schema: z.ZodType<T>, rawData: unknown, context: string): T {
    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
        throw new Error(`Invalid ${context} response from Engram server: ${parsed.error.message}`);
    }
    return parsed.data;
}