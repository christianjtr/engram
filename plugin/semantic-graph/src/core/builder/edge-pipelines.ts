import type { GraphLibEdge, GraphLibNode } from "../../types";
import type { GenericRecord } from "../../utils/helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function edge(
    v: string,
    w: string,
    name: string,
    value: Record<string, unknown>
): GraphLibEdge {
    return { v, w, name, value };
}

// ---------------------------------------------------------------------------
// Pipeline 1 — SESSION → PROJECT
// ---------------------------------------------------------------------------

/**
 * Links each session node to its owning project node.
 * Relation: SESSION -[BELONGS_TO]-> PROJECT
 */
export function buildSessionProjectEdges(
    sessionNodes: GraphLibNode[],
    projectNodes: Map<string, GraphLibNode>
): GraphLibEdge[] {
    const edges: GraphLibEdge[] = [];

    for (const session of sessionNodes) {
        const projectName = session.value.project;
        if (!projectName) continue;

        const projectNode = projectNodes.get(String(projectName));
        if (!projectNode) continue;

        edges.push(
            edge(projectNode.v, session.v, `belongs:${projectNode.v}:${session.v}`, {
                type: "BELONGS_TO",
            })
        );
    }

    return edges;
}

// ---------------------------------------------------------------------------
// Pipeline 2 — OBSERVATION → SESSION
// ---------------------------------------------------------------------------

/**
 * Links each observation node to the session it occurred in.
 * Relation: SESSION -[OCCURRED_IN]-> OBSERVATION
 *
 * @param sessionIdMap  Maps raw session.id (string) to its graph node id (hash).
 */
export function buildObservationSessionEdges(
    observationNodes: GraphLibNode[],
    sessionIdMap: Map<string, string>
): GraphLibEdge[] {
    const edges: GraphLibEdge[] = [];

    for (const obs of observationNodes) {
        const sessionId = obs.value.session_id;
        if (!sessionId) continue;

        const sessionHash = sessionIdMap.get(String(sessionId));
        if (!sessionHash) continue;

        edges.push(
            edge(sessionHash, obs.v, `occurred:${sessionHash}:${obs.v}`, {
                type: "OCCURRED_IN",
            })
        );
    }

    return edges;
}

// ---------------------------------------------------------------------------
// Pipeline 3 — OBSERVATION (global/personal scope) → GLOBAL_CONTEXT + PROJECT
// ---------------------------------------------------------------------------

/**
 * Routes global and personal observations to the GLOBAL_CONTEXT root node,
 * and also marks them as inherited by the active project when not in "all" mode.
 *
 * Relations:
 *  OBSERVATION -[BELONGS_TO]-> GLOBAL_CONTEXT
 *  OBSERVATION -[CO_OCCURRENCE]-> PROJECT  (inherited, only when projectName !== "all")
 */
export function buildScopeRoutingEdges(
    observationNodes: GraphLibNode[],
    projectNodes: Map<string, GraphLibNode>,
    globalContextNode: GraphLibNode | null,
    activeProjectName: string
): GraphLibEdge[] {
    const edges: GraphLibEdge[] = [];

    if (!globalContextNode) return edges;

    for (const obs of observationNodes) {
        const scope = String(obs.value.scope ?? "project").toLowerCase();
        if (scope !== "global" && scope !== "personal") continue;

        // Link to global context root
        edges.push(
            edge(obs.v, globalContextNode.v, `global-belongs:${obs.v}:${globalContextNode.v}`, {
                type: "BELONGS_TO",
            })
        );

        // Also link as inherited by the active project (not in "all" mode)
        if (activeProjectName !== "all") {
            const activeProject = projectNodes.get(activeProjectName);
            if (activeProject) {
                edges.push(
                    edge(obs.v, activeProject.v, `inherited:${obs.v}:${activeProject.v}`, {
                        type: "CO_OCCURRENCE",
                        reason: "Global pattern inherited by current workspace",
                    })
                );
            }
        }
    }

    return edges;
}

// ---------------------------------------------------------------------------
// Pipeline 4 — OBSERVATION (project scope) → PROJECT
// ---------------------------------------------------------------------------

/**
 * Links project-scoped observations to their owning project node.
 * Relation: OBSERVATION -[BELONGS_TO]-> PROJECT
 *
 * Only handles observations whose scope is "project" (the default).
 * Global/personal scope is handled by buildScopeRoutingEdges.
 */
export function buildProjectScopeEdges(
    observationNodes: GraphLibNode[],
    projectNodes: Map<string, GraphLibNode>
): GraphLibEdge[] {
    const edges: GraphLibEdge[] = [];

    for (const obs of observationNodes) {
        const scope = String(obs.value.scope ?? "project").toLowerCase();
        if (scope === "global" || scope === "personal") continue;

        const projectName = obs.value.project;
        if (!projectName) continue;

        const projectNode = projectNodes.get(String(projectName));
        if (!projectNode) continue;

        edges.push(
            edge(obs.v, projectNode.v, `belongs:${obs.v}:${projectNode.v}`, {
                type: "BELONGS_TO",
            })
        );
    }

    return edges;
}

// ---------------------------------------------------------------------------
// Pipeline 5 — OBSERVATION → TOPIC CLUSTER
// ---------------------------------------------------------------------------

/**
 * Links observations that share a topic_key to their synthetic topic-cluster node.
 * Relation: OBSERVATION -[CO_OCCURRENCE]-> TOPIC_CLUSTER
 *
 * @param topicNodes  Maps topic_key (string) to its graph node.
 */
export function buildTopicClusterEdges(
    observationNodes: GraphLibNode[],
    topicNodes: Map<string, GraphLibNode>
): GraphLibEdge[] {
    const edges: GraphLibEdge[] = [];

    for (const obs of observationNodes) {
        const topicKey = obs.value.topic_key;
        if (!topicKey) continue;

        const topicNode = topicNodes.get(String(topicKey));
        if (!topicNode) continue;

        edges.push(
            edge(obs.v, topicNode.v, `topic-link:${obs.v}:${topicNode.v}`, {
                type: "CO_OCCURRENCE",
                reason: "Belongs to topic evolutionary line",
            })
        );
    }

    return edges;
}

// ---------------------------------------------------------------------------
// Pipeline 6 — OBSERVATION → OBSERVATION (sync mutations / semantic relations)
// ---------------------------------------------------------------------------

/**
 * Builds relation edges from sync_mutations payload.
 * Each mutation carries a source_id and target_id (observation sync_ids)
 * which are resolved to their graph node hashes via obsSyncIdMap.
 *
 * Relation: OBSERVATION -[CO_OCCURRENCE + mutation payload]-> OBSERVATION
 *
 * @param obsSyncIdMap  Maps obs.sync_id (string) to its graph node id (hash).
 */
export function buildMutationRelationEdges(
    mutations: GenericRecord[],
    obsSyncIdMap: Map<string, string>
): GraphLibEdge[] {
    const edges: GraphLibEdge[] = [];

    mutations.forEach((mut, index) => {
        const payload = mut.payload as Record<string, unknown> | undefined;
        if (!payload?.source_id || !payload?.target_id) return;

        const sourceHash = obsSyncIdMap.get(String(payload.source_id));
        const targetHash = obsSyncIdMap.get(String(payload.target_id));

        if (!sourceHash || !targetHash) return;

        edges.push(
            edge(sourceHash, targetHash, `relation:${sourceHash}:${targetHash}:${index}`, {
                type: "CO_OCCURRENCE",
                ...payload,
            })
        );
    });

    return edges;
}
