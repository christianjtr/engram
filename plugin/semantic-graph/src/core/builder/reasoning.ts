import type { ReasoningRole, ReasoningRoleMappings } from "../../types";
import { DEFAULT_REASONING_MAPPINGS } from "../../config/semantics";

/**
 * Resolves a high-level cognitive reasoning role for a node based on category and type.
 */
export function resolveReasoningRole(
    nodeType: string | undefined,
    nodeCategory: string,
    mappings?: ReasoningRoleMappings
): ReasoningRole {
    if (nodeCategory === "SESSION" || nodeCategory === "PROJECT") {
        return "HISTORICAL_RECORD";
    }

    if (!nodeType) return "FACT";

    const normalizedType = nodeType.toLowerCase().trim();
    const activeMappings = mappings || DEFAULT_REASONING_MAPPINGS;

    const constraintTypes = activeMappings?.constraint_types || [];
    const historyTypes = activeMappings?.history_types || [];

    if (constraintTypes.includes(normalizedType)) {
        return "CONSTRAINT";
    }
    if (historyTypes.includes(normalizedType)) {
        return "HISTORICAL_RECORD";
    }
    return "FACT";
}