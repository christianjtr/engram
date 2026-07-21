import type { ReasoningRoleMappings } from "../types";

/**
 * Standard semantic reasoning mappings and category classifications for Engram memories.
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