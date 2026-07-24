import type { ReasoningRoleMappings } from "../types";

/**
 * Standard semantic reasoning mappings and category classifications for Engram memories.
 * Tokens are strictly lowercased to prevent case-sensitive lookup bypass bugs.
 */
export const DEFAULT_REASONING_MAPPINGS: ReasoningRoleMappings = {
    constraint_types: [
        "pattern",
        "rule",
        "convention",
        "constraint",
        "architecture"
    ],
    history_types: [
        "session_summary",
        "log"
    ]
};
