import { z } from "zod";
import type {
    EngramExportPayload,
    EngramObservation,
    EngramPrompt,
    EngramRelation,
    EngramSession,
    ScopeType
} from "../../types";

export const ScopeTypeSchema = z.enum(["project", "global", "personal"]) satisfies z.ZodType<ScopeType>;

export const ObservationSchema = z.object({
    id: z.number().int(),
    sync_id: z.string(),
    session_id: z.string(),
    type: z.string(),
    title: z.string(),
    content: z.string(),
    tool_name: z.string().nullable().optional(),
    project: z.string().nullable().optional(),
    scope: ScopeTypeSchema,
    topic_key: z.string().nullable().optional(),
    revision_count: z.number().int(),
    duplicate_count: z.number().int().optional(),
    last_seen_at: z.string().nullable().optional(),
    review_after: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().nullable().optional(),
}) satisfies z.ZodType<EngramObservation>;

export const SessionSchema = z.object({
    id: z.string(),
    project: z.string(),
    ownership_mode: z.string().optional(),
    directory: z.string(),
    started_at: z.string(),
    ended_at: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
}) satisfies z.ZodType<EngramSession>;

export const PromptSchema = z.object({
    id: z.number().int(),
    sync_id: z.string(),
    session_id: z.string(),
    content: z.string(),
    project: z.string().optional(),
    created_at: z.string(),
}) satisfies z.ZodType<EngramPrompt>;

export const ProjectCurrentSchema = z.object({
    project: z.string().trim().min(1).optional(),
    error_hint: z.string().optional(),
});

export const EngramExportSchema = z.object({
    version: z.string(),
    exported_at: z.string(),
    observations: z.array(ObservationSchema).nullable().transform((val) => val ?? []),
    sessions: z.array(SessionSchema).nullable().transform((val) => val ?? []),
    prompts: z.array(PromptSchema).nullable().optional().transform((val) => val ?? []),
}) satisfies z.ZodType<EngramExportPayload>;

export const GlobalObservationsSchema = z.array(ObservationSchema)
    .nullable()
    .transform((val) => val ?? []) satisfies z.ZodType<EngramObservation[]>;

export const JudgedRelationSchema = z.object({
    sync_id: z.string().min(1),
    source_id: z.string().min(1),
    target_id: z.string().min(1),
    relation: z.string().min(1),
    reason: z.string().optional(),
    evidence: z.string().optional(),
    confidence: z.number().optional(),
    judgment_status: z.string().min(1),
}) satisfies z.ZodType<EngramRelation>;

export const ConflictPageSchema = z.object({
    relations: z.array(JudgedRelationSchema).nullable().transform((val) => val ?? []),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
});

/**
 * Validates raw data against a Zod schema or throws a formatted error.
 */
export function parseResponse<T>(schema: z.ZodType<T>, rawData: unknown, context: string): T {
    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
        throw new Error(`Invalid ${context} response from Engram server: ${parsed.error.message}`);
    }
    return parsed.data;
}
