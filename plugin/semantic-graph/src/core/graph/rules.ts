import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import type { ObservationLifecycle, SessionStatus } from "../../types";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

const CONVENTION_TYPES = new Set(["convention", "decision", "architecture", "pattern"]);
const REVIEW_FORMATS = ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ssZ", "YYYY-MM-DDTHH:mm:ss.SSSZ", "YYYY-MM-DD"];

export function normalizeObservationType(rawType?: string | null): string {
    return rawType?.trim().toLowerCase() || "other";
}

export function normalizeTopicKey(topicKey?: string | null): string {
    return topicKey?.trim() || "general";
}

export function isConventionLike(type?: string | null): boolean {
    return CONVENTION_TYPES.has(normalizeObservationType(type));
}

export function calculateObservationLifecycle(
    reviewAfter?: string | null,
    referenceDate: Date = new Date()
): ObservationLifecycle {
    if (!reviewAfter?.trim()) return "active";

    for (const fmt of REVIEW_FORMATS) {
        const d = dayjs.utc(reviewAfter, fmt, true);
        if (d.isValid()) {
            return d.isAfter(referenceDate) ? "active" : "stale";
        }
    }
    return "active";
}

export function calculateSessionStatus(session: {
    ended_at?: string | null;
    summary?: string | null;
}): SessionStatus {
    if (!session.ended_at?.trim()) return "active";
    if (session.summary?.trim()) return "completed";

    return "interrupted";
}