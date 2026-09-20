import type {
    EngramObservation,
    EngramRelation,
    EngramSession,
    GraphEdge,
    GraphEdgeRelation,
    GraphNode,
    TypeMetadata
} from "../types";
import {
    calculateObservationLifecycle,
    calculateSessionStatus,
    isConventionLike,
    normalizeObservationType,
    normalizeTopicKey
} from "./rules";

const GLOBAL_ROOT_ID = "global:context";

export interface GraphAssemblyState {
    nodesMap: Map<string, GraphNode>;
    edges: GraphEdge[];
    obsSyncIdToNodeId: Map<string, string>;
    topicNodesCreated: Set<string>;
}

export interface ObservationCounts {
    active: number;
    stale: number;
}

export function createGraphAssemblyState(): GraphAssemblyState {
    return {
        nodesMap: new Map(),
        edges: [],
        obsSyncIdToNodeId: new Map(),
        topicNodesCreated: new Set(),
    };
}

export function ensureProjectNode(state: GraphAssemblyState, project: string): string {
    const id = `project:${project}`;
    if (!state.nodesMap.has(id)) {
        state.nodesMap.set(id, {
            id,
            category: "PROJECT",
            label: `PROJECT: ${project}`,
            metadata: { project },
        });
        state.edges.push({
            source: id,
            target: GLOBAL_ROOT_ID,
            relation: "INHERITS",
            reason: "Inherits global conventions",
        });
    }
    return id;
}

export function addGraphRoot(state: GraphAssemblyState): void {
    state.nodesMap.set(GLOBAL_ROOT_ID, {
        id: GLOBAL_ROOT_ID,
        category: "GLOBAL_CONTEXT",
        label: "GLOBAL CONTEXT",
        metadata: { scope: "global" },
    });
}

export function addGlobalObservationNodes(
    state: GraphAssemblyState,
    observations: EngramObservation[],
    globalSessionsById: Map<string, EngramSession>,
    fallbackProject: string,
    referenceDate: Date,
): void {
    for (const observation of observations) {
        const nodeId = `obs:global:${observation.id}`;
        if (observation.sync_id) state.obsSyncIdToNodeId.set(observation.sync_id, nodeId);

        state.nodesMap.set(nodeId, {
            id: nodeId,
            category: "OBSERVATION",
            label: observation.title,
            lifecycle: calculateObservationLifecycle(observation.review_after, referenceDate),
            type: normalizeObservationType(observation.type),
            scope: observation.scope,
            content: observation.content,
            metadata: {
                project: observation.project || globalSessionsById.get(observation.session_id)?.project || fallbackProject,
                sync_id: observation.sync_id,
                created_at: observation.created_at,
            },
        });

        state.edges.push({
            source: nodeId,
            target: GLOBAL_ROOT_ID,
            relation: "BELONGS_TO",
            reason: "Global convention",
        });
    }
}

export function addProjectObservationNodes(
    state: GraphAssemblyState,
    observations: EngramObservation[],
    fallbackProject: string,
    isAllProjects: boolean,
    includeStale: boolean,
    referenceDate: Date,
    matchesFilters: (observation: Pick<EngramObservation, "topic_key" | "type">) => boolean,
): { includedObservations: EngramObservation[]; counts: ObservationCounts } {
    const includedObservations: EngramObservation[] = [];
    const counts: ObservationCounts = { active: 0, stale: 0 };

    for (const observation of observations) {
        if (!matchesFilters(observation)) continue;

        const lifecycle = calculateObservationLifecycle(observation.review_after, referenceDate);
        if (lifecycle === "active") counts.active++;
        if (lifecycle === "stale") counts.stale++;
        if (!includeStale && lifecycle === "stale") continue;

        includedObservations.push(observation);

        const project = observation.project || fallbackProject;
        const projectRootId = ensureProjectNode(state, project);
        const rawTopic = normalizeTopicKey(observation.topic_key);
        const topicNodeId = isAllProjects
            ? `topic:${encodeURIComponent(JSON.stringify([project, rawTopic]))}`
            : `topic:${rawTopic}`;

        if (!state.topicNodesCreated.has(topicNodeId)) {
            state.topicNodesCreated.add(topicNodeId);
            state.nodesMap.set(topicNodeId, {
                id: topicNodeId,
                category: "TOPIC",
                label: `TOPIC: ${rawTopic}`,
                metadata: { topic: rawTopic, project },
            });
            state.edges.push({
                source: topicNodeId,
                target: projectRootId,
                relation: "BELONGS_TO",
                reason: "Project topic",
            });
        }

        const observationNodeId = `obs:${observation.id}`;
        if (observation.sync_id) state.obsSyncIdToNodeId.set(observation.sync_id, observationNodeId);

        state.nodesMap.set(observationNodeId, {
            id: observationNodeId,
            category: "OBSERVATION",
            label: observation.title,
            lifecycle,
            type: normalizeObservationType(observation.type),
            scope: observation.scope,
            topic_key: rawTopic,
            content: observation.content,
            metadata: {
                project,
                sync_id: observation.sync_id,
                session_id: observation.session_id,
                created_at: observation.created_at,
            },
        });

        state.edges.push({
            source: observationNodeId,
            target: topicNodeId,
            relation: "BELONGS_TO",
            reason: "Topic membership",
        });
    }

    return { includedObservations, counts };
}

export function addSessionNodes(
    state: GraphAssemblyState,
    sessions: EngramSession[],
    observations: EngramObservation[],
    fallbackProject: string,
): void {
    for (const session of sessions) {
        const sessionNodeId = `session:${session.id}`;
        const projectRootId = ensureProjectNode(state, session.project || fallbackProject);

        state.nodesMap.set(sessionNodeId, {
            id: sessionNodeId,
            category: "SESSION",
            label: `Session ${session.id.slice(0, 8)}`,
            status: calculateSessionStatus(session),
            metadata: { project: session.project, started_at: session.started_at },
        });

        state.edges.push({
            source: sessionNodeId,
            target: projectRootId,
            relation: "BELONGS_TO",
            reason: "Work session",
        });
    }

    for (const observation of observations) {
        if (!observation.session_id) continue;

        const sessionNodeId = `session:${observation.session_id}`;
        const observationNodeId = `obs:${observation.id}`;
        if (state.nodesMap.has(sessionNodeId) && state.nodesMap.has(observationNodeId)) {
            state.edges.push({
                source: observationNodeId,
                target: sessionNodeId,
                relation: "PRODUCED_IN",
                reason: "Recorded during session",
            });
        }
    }
}

export function addRelationEdges(state: GraphAssemblyState, relations: EngramRelation[]): void {
    for (const relation of relations) {
        if (relation.judgment_status !== "judged") continue;

        const sourceId = state.obsSyncIdToNodeId.get(relation.source_id);
        const targetId = state.obsSyncIdToNodeId.get(relation.target_id);
        if (!sourceId || !targetId) continue;

        let edgeRelation: GraphEdgeRelation = "RELATED_TO";
        if (relation.relation === "supersedes") edgeRelation = "SUPERSEDES";
        if (relation.relation === "conflicts_with") edgeRelation = "CONFLICTS_WITH";

        state.edges.push({
            source: sourceId,
            target: targetId,
            relation: edgeRelation,
            reason: relation.reason || `Judged relation: ${relation.relation}`,
            metadata: {
                relation: relation.relation,
                judgment_status: relation.judgment_status,
                evidence: relation.evidence,
                confidence: relation.confidence,
            },
        });
    }
}

export function collectTypeMetadata(nodes: Map<string, GraphNode>): Record<string, TypeMetadata> {
    const uniqueTypes = new Set<string>();
    nodes.forEach((node) => {
        if (node.category === "OBSERVATION" && node.type) uniqueTypes.add(node.type);
    });

    return Array.from(uniqueTypes).reduce<Record<string, TypeMetadata>>((catalog, type) => {
        catalog[type] = {
            type,
            label: type.toUpperCase(),
            isConventionLike: isConventionLike(type),
        };
        return catalog;
    }, {});
}