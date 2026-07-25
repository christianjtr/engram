import type { GraphLibNode, ReasoningRole, SessionStatus } from "../../types";
import { NODE_LEVEL_MAP } from "../../types";
import type { GenericRecord } from "../../utils/helpers";
import { resolveReasoningRole } from "./reasoning";
import {
    getSessionNodeId,
    getObservationNodeId,
    getProjectNodeId,
    getGlobalContextNodeId,
    getTopicClusterNodeId,
} from "./graph-context";
import type { ReasoningRoleMappings } from "../../types";

// ---------------------------------------------------------------------------
// Real nodes — built directly from SQLite rows
// ---------------------------------------------------------------------------

/**
 * Creates a SESSION node from a raw sessions row.
 * Returns null if the row has no id (invalid, skip).
 */
export function createSessionNode(
    session: GenericRecord,
    mappings: ReasoningRoleMappings
): GraphLibNode | null {
    if (!session.id) return null;

    const endedAt = session.ended_at;
    const hasSummary = session.summary != null && session.summary !== "";
    const status: SessionStatus =
        endedAt == null ? "active"
        : hasSummary    ? "completed"
        :                 "interrupted";

    return {
        v: getSessionNodeId(session.id as string | number),
        value: {
            category: "SESSION",
            level: NODE_LEVEL_MAP.SESSION,
            reasoning_role: resolveReasoningRole(undefined, "SESSION", mappings),
            status,
            ...session,
        },
    };
}

/**
 * Creates an OBSERVATION node from a raw observations row.
 * Returns null if the row has no id (invalid, skip).
 */
export function createObservationNode(
    obs: GenericRecord,
    mappings: ReasoningRoleMappings
): GraphLibNode | null {
    if (!obs.id) return null;

    const nodeType = obs.type ? String(obs.type) : undefined;
    const reviewAfter = obs.review_after;
    const is_stale =
        reviewAfter != null && new Date(String(reviewAfter)) < new Date();

    return {
        v: getObservationNodeId(obs as { id: unknown; sync_id?: unknown }),
        value: {
            category: "OBSERVATION",
            level: NODE_LEVEL_MAP.OBSERVATION,
            reasoning_role: resolveReasoningRole(nodeType, "OBSERVATION", mappings),
            is_stale,
            ...obs,
        },
    };
}

/**
 * Creates a PROJECT node for a given project name.
 */
export function createProjectNode(projectName: string, mappings: ReasoningRoleMappings): GraphLibNode {
    return {
        v: getProjectNodeId(projectName),
        value: {
            category: "PROJECT",
            level: NODE_LEVEL_MAP.PROJECT,
            reasoning_role: resolveReasoningRole(undefined, "PROJECT", mappings),
            name: projectName,
        },
    };
}

// ---------------------------------------------------------------------------
// Synthetic nodes — virtual, not backed by a DB row
// ---------------------------------------------------------------------------

/**
 * Creates the single GLOBAL_CONTEXT root node.
 * Synthetic: represents the cross-project scope boundary.
 * Uses category "PROJECT" (consistent with existing schema) and type
 * "global_context" to distinguish it from real project nodes.
 */
export function createGlobalContextNode(): GraphLibNode {
    return {
        v: getGlobalContextNodeId(),
        value: {
            category: "PROJECT",
            level: NODE_LEVEL_MAP.PROJECT,
            reasoning_role: "FACT" as ReasoningRole,
            type: "global_context",
            name: "GLOBAL_CONTEXT",
            is_synthetic: true,
            content: "Global and personal shared cross-project conventions environment.",
        },
    };
}

/**
 * Creates a TOPIC CLUSTER node for a given topic_key.
 * Synthetic: aggregates observations that share a topic evolutionary line.
 * Uses category "OBSERVATION" (topic_key is a field on the observations table)
 * and type "topic_cluster" to distinguish it from real observation nodes.
 */
export function createTopicClusterNode(topicKey: string): GraphLibNode {
    return {
        v: getTopicClusterNodeId(topicKey),
        value: {
            category: "OBSERVATION",
            level: NODE_LEVEL_MAP.OBSERVATION,
            reasoning_role: "FACT" as ReasoningRole,
            type: "topic_cluster",
            is_synthetic: true,
            topic_key: topicKey,
            title: `Topic: ${topicKey}`,
            content: `Evolving decision context workspace cluster tracking updates for: ${topicKey}`,
        },
    };
}
