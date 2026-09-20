import type {
    EngramObservation,
    EngramRelation,
    EngramSession,
    GraphBuildOptions,
    SemanticGraph
} from "../types";
import {
    addGraphRoot,
    addGlobalObservationNodes,
    addProjectObservationNodes,
    addRelationEdges,
    addSessionNodes,
    collectTypeMetadata,
    createGraphAssemblyState,
    ensureProjectNode
} from "./sections";
import { calculateObservationLifecycle, normalizeObservationType, normalizeTopicKey } from "./rules";

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

    if (options.all && options.project?.trim()) {
        throw new Error("Graph options cannot combine all-project mode with an explicit project");
    }

    if (options.referenceDate && Number.isNaN(options.referenceDate.getTime())) {
        throw new Error("Graph reference date must be valid");
    }

    if (options.globalLimit !== undefined && options.globalLimit !== "all") {
        if (!Number.isSafeInteger(options.globalLimit) || options.globalLimit < 0) {
            throw new Error("Graph global limit must be a non-negative safe integer or 'all'");
        }
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

function selectGlobalObservations(
    observations: EngramObservation[],
    includeStale: boolean,
    globalLimit: number | "all" | undefined,
    referenceDate: Date,
    matchesFilters: (observation: Pick<EngramObservation, "topic_key" | "type">) => boolean,
): EngramObservation[] {
    const processedGlobals = observations.filter((observation) => {
        if (!matchesFilters(observation)) return false;
        return includeStale || calculateObservationLifecycle(observation.review_after, referenceDate) === "active";
    });

    const limit = globalLimit === "all" ? processedGlobals.length : (globalLimit ?? 15);
    return processedGlobals.slice(0, limit);
}

/**
 * Core graph assembly engine.
 * Converts flat, relational Engram records into a hierarchical JSON graph.
 */
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
    const typeFilter = new Set((options.typeFilter ?? []).map((type) => normalizeObservationType(type)));
    const includeStale = options.includeStale ?? false;
    const matchesFilters = createObservationFilter(topicFilter, typeFilter);
    const validObservations = inputObservations.filter((observation) => observation.deleted_at == null && observation.scope !== "global");
    const validGlobals = inputGlobalObservations.filter((observation) => observation.deleted_at == null && observation.scope === "global");
    const globalSessionsById = new Map(globalSessions.map((session) => [session.id, session]));
    const state = createGraphAssemblyState();

    addGraphRoot(state);
    if (!isAllProjects) ensureProjectNode(state, projectName);

    const selectedGlobals = selectGlobalObservations(
        validGlobals,
        includeStale,
        options.globalLimit,
        referenceDate,
        matchesFilters,
    );
    addGlobalObservationNodes(state, selectedGlobals, globalSessionsById, fallbackProject, referenceDate);

    const { includedObservations, counts } = addProjectObservationNodes(
        state,
        validObservations,
        fallbackProject,
        isAllProjects,
        includeStale,
        referenceDate,
        matchesFilters,
    );

    if (options.includeSessions) {
        addSessionNodes(state, sessions, includedObservations, fallbackProject);
    }

    addRelationEdges(state, relations);

    return {
        nodes: Array.from(state.nodesMap.values()),
        edges: state.edges,
        types: collectTypeMetadata(state.nodesMap),
        slice: {
            project: projectName,
            totalObservations: validObservations.length,
            activeCount: counts.active,
            staleCount: counts.stale,
            globalRulesInherited: selectedGlobals.length,
            globalRulesTotal: validGlobals.length,
            topicsCount: state.topicNodesCreated.size,
            isExhaustive: Boolean(options.isExhaustive),
            generatedAt: referenceDate.toISOString(),
        },
    };
}
