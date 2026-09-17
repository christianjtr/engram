import {
    ObservationLifecycle,
    SessionStatus,
    StandardObservationType,
    TypeMetadata
} from "../types";

/**
 * Standard visual and behavioral metadata for Engram core types.
 * Pure text labels are used; icons and emojis are explicitly excluded.
 */
export const DEFAULT_TYPE_METADATA: Record<StandardObservationType, TypeMetadata> = {
    convention: {
        type: "convention",
        label: "CONVENTION",
        color: "#10b981", // Emerald
        isConventionLike: true,
    },
    decision: {
        type: "decision",
        label: "DECISION",
        color: "#3b82f6", // Blue
        isConventionLike: true,
    },
    architecture: {
        type: "architecture",
        label: "ARCHITECTURE",
        color: "#8b5cf6", // Violet
        isConventionLike: true,
    },
    pattern: {
        type: "pattern",
        label: "PATTERN",
        color: "#06b6d4", // Cyan
        isConventionLike: true,
    },
    config: {
        type: "config",
        label: "CONFIG",
        color: "#64748b", // Slate
        isConventionLike: false,
    },
    bugfix: {
        type: "bugfix",
        label: "BUGFIX",
        color: "#ef4444", // Red
        isConventionLike: false,
    },
    discovery: {
        type: "discovery",
        label: "DISCOVERY",
        color: "#f59e0b", // Amber
        isConventionLike: false,
    },
    learning: {
        type: "learning",
        label: "LEARNING",
        color: "#ec4899", // Pink
        isConventionLike: false,
    },
};

/**
 * Derives whether an observation is active or stale based on its review_after date.
 * If review_after is absent, empty, or invalid, the observation is considered active.
 */
export function calculateObservationLifecycle(
    reviewAfter?: string | null,
    referenceDate: Date = new Date()
): ObservationLifecycle {
    if (!reviewAfter || !reviewAfter.trim()) {
        return "active";
    }

    const reviewDate = new Date(reviewAfter.trim());
    if (isNaN(reviewDate.getTime())) {
        return "active";
    }

    return reviewDate < referenceDate ? "stale" : "active";
}

/**
 * Derives the operational status of an Engram session.
 * - active: session is currently open (ended_at is absent or empty).
 * - completed: session ended with an explicit summary.
 * - interrupted: session ended without a summary.
 */
export function calculateSessionStatus(session: {
    ended_at?: string | null;
    summary?: string | null;
}): SessionStatus {
    if (!session.ended_at || !session.ended_at.trim()) {
        return "active";
    }

    if (session.summary && session.summary.trim() !== "") {
        return "completed";
    }

    return "interrupted";
}

/**
 * Normalizes a topic key. Falls back to "general" when absent or empty.
 */
export function normalizeTopicKey(topicKey?: string | null): string {
    if (!topicKey || !topicKey.trim()) {
        return "general";
    }
    return topicKey.trim();
}

/**
 * Normalizes an observation type string. Falls back to "other" when absent or empty.
 */
export function normalizeObservationType(rawType?: string | null): string {
    if (!rawType || !rawType.trim()) {
        return "other";
    }
    return rawType.trim().toLowerCase();
}

/**
 * Generates a deterministic hex color from any arbitrary string using djb2 hash.
 */
export function generateDeterministicColor(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    const hue = Math.abs(hash) % 360;
    return hslToHex(hue, 65, 55);
}

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Builds a dynamic type registry by combining the default standard types with
 * all distinct types discovered from runtime database observations.
 * All labels are plain text in uppercase; no icons are used.
 */
export function buildDynamicTypeRegistry(
    observations: Array<{ type?: string | null }>
): Record<string, TypeMetadata> {
    const registry: Record<string, TypeMetadata> = {};

    // Populate defaults
    for (const [key, meta] of Object.entries(DEFAULT_TYPE_METADATA)) {
        registry[key] = { ...meta };
    }

    // Discover custom types from DB
    for (const obs of observations) {
        const type = normalizeObservationType(obs.type);
        if (!type || registry[type]) {
            continue;
        }

        registry[type] = {
            type,
            label: type.toUpperCase(),
            color: generateDeterministicColor(type),
            isConventionLike: false,
        };
    }

    return registry;
}
