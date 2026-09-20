import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { ObservationLifecycle, SessionStatus } from "../types";

dayjs.extend(utc);

/**
 * Defines which observation types represent enforceable rules or architectural decisions.
 */
const CONVENTION_TYPES = new Set([
    "convention",
    "decision",
    "architecture",
    "pattern"
]);

export function isConventionLike(type?: string | null): boolean {
    return CONVENTION_TYPES.has(normalizeObservationType(type));
}

/**
 * Derives whether an observation is active or stale based on its review_after date.
 * If review_after is absent, empty, or invalid, the observation is considered active.
 */
export function calculateObservationLifecycle(
    reviewAfter?: string | null,
    referenceDate: Date = new Date()
): ObservationLifecycle {
    if (!reviewAfter || !reviewAfter.trim()) return "active";

    const reviewDate = dayjs.utc(reviewAfter, "YYYY-MM-DD HH:mm:ss");
    if (!reviewDate.isValid()) return "active";

    return reviewDate.isBefore(referenceDate) ? "stale" : "active";
}

/**
 * Derives the operational status of an Engram session.
 */
export function calculateSessionStatus(session: {
    ended_at?: string | null;
    summary?: string | null;
}): SessionStatus {
    if (!session.ended_at || !session.ended_at.trim()) return "active";
    if (session.summary && session.summary.trim() !== "") return "completed";

    return "interrupted";
}

export function normalizeTopicKey(topicKey?: string | null): string {
    return topicKey?.trim() || "general";
}

export function normalizeObservationType(rawType?: string | null): string {
    return rawType?.trim().toLowerCase() || "other";
}