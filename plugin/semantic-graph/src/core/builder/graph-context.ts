import { generateMD5Hash } from "../../utils/helpers";

/**
 * Pure ID generators — no side effects, no graph mutation.
 * Each function derives a stable, deterministic hash for a given domain key.
 * Use these to reference nodes before or after they are created.
 */

/** Stable ID for a session node. */
export function getSessionNodeId(sessionId: string | number): string {
    return generateMD5Hash(`session-${sessionId}`);
}

/** Stable ID for an observation node. Uses sync_id when available. */
export function getObservationNodeId(obs: { id: unknown; sync_id?: unknown }): string {
    const key = obs.sync_id ? String(obs.sync_id) : `obs-${obs.id}`;
    return generateMD5Hash(`observation-${key}`);
}

/** Stable ID for a project node. */
export function getProjectNodeId(projectName: string): string {
    return generateMD5Hash(`project-${projectName}`);
}

/** Stable ID for the single global-context root node. */
export function getGlobalContextNodeId(): string {
    return generateMD5Hash("scope-global-context-root");
}

/** Stable ID for a topic-cluster node derived from a topic_key. */
export function getTopicClusterNodeId(topicKey: string): string {
    return generateMD5Hash(`topic-${topicKey.toLowerCase()}`);
}
