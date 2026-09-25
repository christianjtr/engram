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

interface GraphDraft {
    nodesMap: Map<string, GraphNode>;
    edges: GraphEdge[];
    syncMap: Map<string, string>;
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

function isNonDeleted(obs: EngramObservation): boolean {
    return obs.deleted_at == null || obs.deleted_at.trim() === "";
}

function resolveProject(
    observation: Pick<EngramObservation, "project" | "session_id">,
    sessionsById: Map<string, EngramSession>,
    fallbackProject: string,
): string {
    return (
        observation.project || sessionsById.get(observation.session_id)?.project || fallbackProject
    );
}

function makeTopicNodeId(rawTopic: string, project: string, isAllProjects: boolean): string {
    return isAllProjects
        ? `topic:${encodeURIComponent(JSON.stringify([project, rawTopic]))}`
        : `topic:${rawTopic}`;
}

function selectGlobalObservations(
    observations: EngramObservation[],
    matchesFilters: (obs: Pick<EngramObservation, "topic_key" | "type">) => boolean,
    includeStale: boolean,
    referenceDate: Date,
    allGlobals: boolean | undefined,
    globalLimit: number | undefined,
): EngramObservation[] {
    const processed = observations.filter((obs) => {
        if (!matchesFilters(obs)) return false;
        return (
            includeStale ||
            calculateObservationLifecycle(obs.review_after, referenceDate) === "active"
        );
    });
    return allGlobals ? processed : processed.slice(0, globalLimit ?? DEFAULT_GLOBAL_LIMIT);
}

function addProjectObservations(
    observations: EngramObservation[],
    draft: GraphDraft,
    params: {
        matchesFilters: (obs: Pick<EngramObservation, "topic_key" | "type">) => boolean;
        includeStale: boolean;
        referenceDate: Date;
        sessionsById: Map<string, EngramSession>;
        fallbackProject: string;
        isAllProjects: boolean;
    },
): {
    included: EngramObservation[];
    activeCount: number;
    staleCount: number;
    topicsCount: number;
} {
    const topicNodesCreated = new Set<string>();
    const included: EngramObservation[] = [];
    let activeCount = 0;
    let staleCount = 0;

    for (const observation of observations) {
        if (!params.matchesFilters(observation)) continue;

        const lifecycle = calculateObservationLifecycle(
            observation.review_after,
            params.referenceDate,
        );
        if (lifecycle === "active") activeCount++;
        if (lifecycle === "stale") staleCount++;
        if (!params.includeStale && lifecycle === "stale") continue;

        included.push(observation);

        const project = resolveProject(observation, params.sessionsById, params.fallbackProject);
        const projectRootId = ensureProjectNode(draft.nodesMap, draft.edges, project);
        const rawTopic = normalizeTopicKey(observation.topic_key);
        const topicNodeId = makeTopicNodeId(rawTopic, project, params.isAllProjects);

        if (!topicNodesCreated.has(topicNodeId)) {
            topicNodesCreated.add(topicNodeId);
            draft.nodesMap.set(topicNodeId, {
                id: topicNodeId,
                category: "TOPIC",
                label: `TOPIC: ${rawTopic}`,
                metadata: { topic: rawTopic, project },
            });
            draft.edges.push({
                source: topicNodeId,
                target: projectRootId,
                relation: "BELONGS_TO",
                reason: "Project topic",
            });
        }

        const observationNodeId = `obs:${observation.id}`;
        if (observation.sync_id) draft.syncMap.set(observation.sync_id, observationNodeId);

        draft.nodesMap.set(observationNodeId, {
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

        draft.edges.push({
            source: observationNodeId,
            target: topicNodeId,
            relation: "BELONGS_TO",
            reason: "Topic membership",
        });
    }

    return { included, activeCount, staleCount, topicsCount: topicNodesCreated.size };
}

function addSessionNodes(
    sessions: EngramSession[],
    includedObservations: EngramObservation[],
    draft: GraphDraft,
    fallbackProject: string,
): void {
    for (const session of sessions) {
        const sessionNodeId = `session:${session.id}`;
        const projectRootId = ensureProjectNode(
            draft.nodesMap,
            draft.edges,
            session.project || fallbackProject,
        );

        draft.nodesMap.set(sessionNodeId, {
            id: sessionNodeId,
            category: "SESSION",
            label: `Session ${session.id.slice(0, 8)}`,
            status: calculateSessionStatus(session),
            metadata: { project: session.project, started_at: session.started_at },
        });

        draft.edges.push({
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
        if (draft.nodesMap.has(sessionNodeId) && draft.nodesMap.has(observationNodeId)) {
            draft.edges.push({
                source: observationNodeId,
                target: sessionNodeId,
                relation: "PRODUCED_IN",
                reason: "Recorded during session",
            });
        }
    }
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

    const validObservations = inputObservations.filter(
        (obs) => isNonDeleted(obs) && obs.scope !== "global",
    );
    const validGlobals = inputGlobalObservations.filter(
        (obs) => isNonDeleted(obs) && obs.scope === "global",
    );
    const globalSessionsById = new Map(globalSessions.map((session) => [session.id, session]));
    const sessionsById = new Map(sessions.map((session) => [session.id, session]));

    const draft: GraphDraft = {
        nodesMap: new Map<string, GraphNode>(),
        edges: [],
        syncMap: new Map<string, string>(),
    };

    draft.nodesMap.set(GLOBAL_ROOT_ID, {
        id: GLOBAL_ROOT_ID,
        category: "GLOBAL_CONTEXT",
        label: "GLOBAL CONTEXT",
        metadata: { scope: "global" },
    });

    if (!isAllProjects) {
        ensureProjectNode(draft.nodesMap, draft.edges, projectName);
    }

    const selectedGlobals = selectGlobalObservations(
        validGlobals,
        matchesFilters,
        includeStale,
        referenceDate,
        options.allGlobals,
        options.globalLimit,
    );

    const globalResult = buildGlobalObservationNodes(
        selectedGlobals,
        globalSessionsById,
        fallbackProject,
        referenceDate,
    );
    for (const node of globalResult.nodes) {
        draft.nodesMap.set(node.id, node);
    }
    draft.edges.push(...globalResult.edges);
    for (const [syncId, id] of globalResult.syncMap) {
        draft.syncMap.set(syncId, id);
    }

    const { included, activeCount, staleCount, topicsCount } = addProjectObservations(
        validObservations,
        draft,
        {
            matchesFilters,
            includeStale,
            referenceDate,
            sessionsById,
            fallbackProject,
            isAllProjects,
        },
    );

    if (options.includeSessions) {
        addSessionNodes(sessions, included, draft, fallbackProject);
    }

    draft.edges.push(...buildRelationEdges(relations, draft.syncMap));

    const nodesArray = Array.from(draft.nodesMap.values());

    return {
        nodes: nodesArray,
        edges: draft.edges,
        types: collectTypeMetadata(nodesArray),
        slice: {
            project: projectName,
            totalObservations: validObservations.length,
            activeCount,
            staleCount,
            globalRulesInherited: selectedGlobals.length,
            globalRulesTotal: validGlobals.length,
            topicsCount,
            isExhaustive: Boolean(options.isExhaustive),
            generatedAt: referenceDate.toISOString(),
        },
    };
}
