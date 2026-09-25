import { DEFAULT_GLOBAL_LIMIT } from "../../config";
import type { EngramObservation, EngramRelation, EngramSession } from "../../services/engram/types";
import type { GraphBuildOptions, GraphEdge, GraphNode, SemanticGraph } from "../../types";
import {
    buildGlobalObservationNodes,
    buildRelationEdges,
    collectTypeMetadata,
    ensureProjectNode,
} from "./builder";
import {
    calculateObservationLifecycle,
    calculateSessionStatus,
    normalizeObservationType,
    normalizeTopicKey,
} from "./rules";

const GLOBAL_ROOT_ID = "global:context";

export interface BuildGraphInput {
    projectName: string;
    observations: EngramObservation[];
    globalObservations?: EngramObservation[];
    globalSessions?: EngramSession[];
    sessions?: EngramSession[];
    relations?: EngramRelation[];
    options?: GraphBuildOptions;
}

function validateBuildInput(input: BuildGraphInput, options: GraphBuildOptions): void {
    if (!input.projectName.trim()) {
        throw new Error("Graph project name must not be empty");
    }
    if (options.referenceDate && Number.isNaN(options.referenceDate.getTime())) {
        throw new Error("Graph reference date must be valid");
    }
    if (
        options.globalLimit !== undefined &&
        (!Number.isSafeInteger(options.globalLimit) || options.globalLimit < 0)
    ) {
        throw new Error("Graph global limit must be a non-negative safe integer");
    }
}

function createObservationFilter(topicFilter: string | undefined, typeFilter: Set<string>) {
    return (observation: Pick<EngramObservation, "topic_key" | "type">): boolean => {
        const topic = normalizeTopicKey(observation.topic_key);
        const type = normalizeObservationType(observation.type);
        if (topicFilter && topic !== topicFilter) return false;
        if (typeFilter.size > 0 && !typeFilter.has(type)) return false;
        return true;
    };
}

export function buildSemanticGraph(input: BuildGraphInput): SemanticGraph {
    const {
        projectName,
        observations: inputObservations = [],
        globalObservations: inputGlobalObservations = [],
        globalSessions = [],
        sessions = [],
        relations = [],
        options = {},
    } = input;

    validateBuildInput(input, options);

    const referenceDate = options.referenceDate ?? new Date();
    const isAllProjects = Boolean(options.all);
    const fallbackProject = isAllProjects ? "unknown-project" : projectName;
    const topicFilter = options.topicFilter ? normalizeTopicKey(options.topicFilter) : undefined;
    const typeFilter = new Set(
        (options.typeFilter ?? []).map((type) => normalizeObservationType(type)),
    );
    const includeStale = options.includeStale ?? false;
    const matchesFilters = createObservationFilter(topicFilter, typeFilter);

    const isNonDeleted = (obs: EngramObservation) =>
        obs.deleted_at == null || obs.deleted_at.trim() === "";
    const validObservations = inputObservations.filter(
        (obs) => isNonDeleted(obs) && obs.scope !== "global",
    );
    const validGlobals = inputGlobalObservations.filter(
        (obs) => isNonDeleted(obs) && obs.scope === "global",
    );
    const globalSessionsById = new Map(globalSessions.map((session) => [session.id, session]));
    const sessionsById = new Map(sessions.map((session) => [session.id, session]));

    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const syncMap = new Map<string, string>();
    const topicNodesCreated = new Set<string>();

    nodesMap.set(GLOBAL_ROOT_ID, {
        id: GLOBAL_ROOT_ID,
        category: "GLOBAL_CONTEXT",
        label: "GLOBAL CONTEXT",
        metadata: { scope: "global" },
    });

    if (!isAllProjects) {
        ensureProjectNode(nodesMap, edges, projectName);
    }

    const processedGlobals = validGlobals.filter((obs) => {
        if (!matchesFilters(obs)) return false;
        return (
            includeStale ||
            calculateObservationLifecycle(obs.review_after, referenceDate) === "active"
        );
    });

    const selectedGlobals = options.allGlobals
        ? processedGlobals
        : processedGlobals.slice(0, options.globalLimit ?? DEFAULT_GLOBAL_LIMIT);

    const globalResult = buildGlobalObservationNodes(
        selectedGlobals,
        globalSessionsById,
        fallbackProject,
        referenceDate,
    );
    for (const node of globalResult.nodes) {
        nodesMap.set(node.id, node);
    }
    edges.push(...globalResult.edges);
    for (const [syncId, id] of globalResult.syncMap) {
        syncMap.set(syncId, id);
    }

    let activeCount = 0;
    let staleCount = 0;

    const includedObservations: EngramObservation[] = [];

    for (const observation of validObservations) {
        if (!matchesFilters(observation)) continue;

        const lifecycle = calculateObservationLifecycle(observation.review_after, referenceDate);
        if (lifecycle === "active") activeCount++;
        if (lifecycle === "stale") staleCount++;
        if (!includeStale && lifecycle === "stale") continue;

        includedObservations.push(observation);

        const project =
            observation.project ||
            sessionsById.get(observation.session_id)?.project ||
            fallbackProject;
        const projectRootId = ensureProjectNode(nodesMap, edges, project);
        const rawTopic = normalizeTopicKey(observation.topic_key);
        const topicNodeId = isAllProjects
            ? `topic:${encodeURIComponent(JSON.stringify([project, rawTopic]))}`
            : `topic:${rawTopic}`;

        if (!topicNodesCreated.has(topicNodeId)) {
            topicNodesCreated.add(topicNodeId);
            nodesMap.set(topicNodeId, {
                id: topicNodeId,
                category: "TOPIC",
                label: `TOPIC: ${rawTopic}`,
                metadata: { topic: rawTopic, project },
            });
            edges.push({
                source: topicNodeId,
                target: projectRootId,
                relation: "BELONGS_TO",
                reason: "Project topic",
            });
        }

        const observationNodeId = `obs:${observation.id}`;
        if (observation.sync_id) syncMap.set(observation.sync_id, observationNodeId);

        nodesMap.set(observationNodeId, {
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

        edges.push({
            source: observationNodeId,
            target: topicNodeId,
            relation: "BELONGS_TO",
            reason: "Topic membership",
        });
    }

    if (options.includeSessions) {
        for (const session of sessions) {
            const sessionNodeId = `session:${session.id}`;
            const projectRootId = ensureProjectNode(
                nodesMap,
                edges,
                session.project || fallbackProject,
            );

            nodesMap.set(sessionNodeId, {
                id: sessionNodeId,
                category: "SESSION",
                label: `Session ${session.id.slice(0, 8)}`,
                status: calculateSessionStatus(session),
                metadata: { project: session.project, started_at: session.started_at },
            });

            edges.push({
                source: sessionNodeId,
                target: projectRootId,
                relation: "BELONGS_TO",
                reason: "Work session",
            });
        }

        for (const observation of includedObservations) {
            if (!observation.session_id) continue;
            const sessionNodeId = `session:${observation.session_id}`;
            const observationNodeId = `obs:${observation.id}`;
            if (nodesMap.has(sessionNodeId) && nodesMap.has(observationNodeId)) {
                edges.push({
                    source: observationNodeId,
                    target: sessionNodeId,
                    relation: "PRODUCED_IN",
                    reason: "Recorded during session",
                });
            }
        }
    }

    edges.push(...buildRelationEdges(relations, syncMap));

    const nodesArray = Array.from(nodesMap.values());

    return {
        nodes: nodesArray,
        edges,
        types: collectTypeMetadata(nodesArray),
        slice: {
            project: projectName,
            totalObservations: validObservations.length,
            activeCount,
            staleCount,
            globalRulesInherited: selectedGlobals.length,
            globalRulesTotal: validGlobals.length,
            topicsCount: topicNodesCreated.size,
            isExhaustive: Boolean(options.isExhaustive),
            generatedAt: referenceDate.toISOString(),
        },
    };
}
