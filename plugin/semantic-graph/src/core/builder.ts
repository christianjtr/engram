import {
    EngramObservation,
    EngramRelation,
    EngramSession,
    GraphBuildOptions,
    GraphEdge,
    GraphEdgeRelation,
    GraphNode,
    SemanticGraph,
    SliceMetadata
} from "../types";
import {
    buildDynamicTypeRegistry,
    calculateObservationLifecycle,
    calculateSessionStatus,
    normalizeObservationType,
    normalizeTopicKey
} from "./derivations";

export interface BuildGraphInput {
    projectName: string;
    observations: EngramObservation[];
    globalObservations?: EngramObservation[];
    /** Source sessions for inherited provenance only; not rendered as session nodes. */
    globalSessions?: EngramSession[];
    sessions?: EngramSession[];
    relations?: EngramRelation[];
    options?: GraphBuildOptions;
}

/**
 * Core graph construction and smart slicing engine.
 * Assembles a clean, hierarchical semantic graph from normalized Engram records.
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

    const referenceDate = new Date();
    const observations = inputObservations.filter((obs) => obs.deleted_at == null);
    const globalObservations = inputGlobalObservations.filter((obs) => obs.deleted_at == null);
    const fallbackProject = options.all ? "unknown-project" : projectName;
    const sessionProjects = new Map([...globalSessions, ...sessions].map((sess) => [sess.id, sess.project]));
    const observationProject = (obs: EngramObservation, fallback = fallbackProject): string =>
        obs.project || sessionProjects.get(obs.session_id) || fallback;

    const globalLimit = options.globalLimit ?? 15;
    const includeStale = options.includeStale ?? false;
    const includeSessions = options.includeSessions ?? false;
    const topicFilter = options.topicFilter?.trim().toLowerCase();
    const typeFilter = options.typeFilter?.map((t) => t.trim().toLowerCase());

    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // ── 1. Root Context Nodes ────────────────────────────────────────────────
    const globalContextId = "global:context";

    nodesMap.set(globalContextId, {
        id: globalContextId,
        category: "GLOBAL_CONTEXT",
        label: "GLOBAL CONTEXT",
        metadata: { scope: "global" },
    });

    function ensureProjectRoot(project: string): string {
        const id = `project:${project}`;
        if (!nodesMap.has(id)) {
            nodesMap.set(id, {
                id,
                category: "PROJECT",
                label: `PROJECT: ${project}`,
                metadata: { project },
            });
            edges.push({
                source: id,
                target: globalContextId,
                relation: "INHERITS",
                reason: "Inherited global conventions and organizational rules",
            });
        }
        return id;
    }

    if (!options.all) ensureProjectRoot(projectName);

    // ── 2. Global Inherited Observations ─────────────────────────────────────
    const candidateGlobals = globalObservations.filter((obs) => {
        if (!includeStale && calculateObservationLifecycle(obs.review_after, referenceDate) === "stale") {
            return false;
        }
        if (typeFilter && typeFilter.length > 0) {
            const obsType = normalizeObservationType(obs.type);
            if (!typeFilter.includes(obsType)) return false;
        }
        return true;
    });

    const slicedGlobals =
        globalLimit === "all"
            ? candidateGlobals
            : typeof globalLimit === "number" && globalLimit > 0
              ? candidateGlobals.slice(0, globalLimit)
              : [];

    for (const obs of slicedGlobals) {
        const obsNodeId = `obs:global:${obs.id}`;
        const lifecycle = calculateObservationLifecycle(obs.review_after, referenceDate);
        const normalizedType = normalizeObservationType(obs.type);

        nodesMap.set(obsNodeId, {
            id: obsNodeId,
            category: "OBSERVATION",
            label: obs.title,
            lifecycle,
            type: normalizedType,
            scope: obs.scope,
            topic_key: obs.topic_key ?? undefined,
            content: obs.content,
            metadata: {
                project: observationProject(obs, "unknown-project"),
                sync_id: obs.sync_id,
                created_at: obs.created_at,
                updated_at: obs.updated_at,
            },
        });

        edges.push({
            source: obsNodeId,
            target: globalContextId,
            relation: "BELONGS_TO",
            reason: "Global convention definition",
        });
    }

    // ── 3. Project Observations & Topic Clusters ─────────────────────────────
    const topicNodesCreated = new Set<string>();
    const obsSyncIdToNodeId = new Map<string, string>();

    // Also index global observations by sync_id for relation edge mapping
    for (const obs of slicedGlobals) {
        if (obs.sync_id) {
            obsSyncIdToNodeId.set(obs.sync_id, `obs:global:${obs.id}`);
        }
    }

    let activeCount = 0;
    let staleCount = 0;
    const includedProjectObservations: EngramObservation[] = [];

    for (const obs of observations) {
        const lifecycle = calculateObservationLifecycle(obs.review_after, referenceDate);
        if (lifecycle === "active") activeCount++;
        if (lifecycle === "stale") staleCount++;

        // Apply filters
        if (!includeStale && lifecycle === "stale") {
            continue;
        }

        const rawTopic = normalizeTopicKey(obs.topic_key);
        if (topicFilter && !rawTopic.toLowerCase().includes(topicFilter)) {
            continue;
        }

        const normalizedType = normalizeObservationType(obs.type);
        if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(normalizedType)) {
            continue;
        }

        includedProjectObservations.push(obs);

        // Ensure topic node exists
        const project = observationProject(obs);
        const topicProject = options.all ? project : projectName;
        const projectRootId = ensureProjectRoot(topicProject);
        // Tuple encoding avoids delimiter collisions; single-project IDs remain stable.
        const topicNodeId = options.all ? `topic:${JSON.stringify([project, rawTopic])}` : `topic:${rawTopic}`;
        if (!topicNodesCreated.has(topicNodeId)) {
            topicNodesCreated.add(topicNodeId);
            nodesMap.set(topicNodeId, {
                id: topicNodeId,
                category: "TOPIC",
                label: `TOPIC: ${rawTopic}`,
                metadata: { topic: rawTopic, project: topicProject },
            });

            edges.push({
                source: topicNodeId,
                target: projectRootId,
                relation: "BELONGS_TO",
                reason: "Project topic domain cluster",
            });
        }

        // Add observation node
        const obsNodeId = `obs:${obs.id}`;
        if (obs.sync_id) {
            obsSyncIdToNodeId.set(obs.sync_id, obsNodeId);
        }

        nodesMap.set(obsNodeId, {
            id: obsNodeId,
            category: "OBSERVATION",
            label: obs.title,
            lifecycle,
            type: normalizedType,
            scope: obs.scope,
            topic_key: rawTopic,
            content: obs.content,
            metadata: {
                project,
                sync_id: obs.sync_id,
                session_id: obs.session_id,
                created_at: obs.created_at,
                updated_at: obs.updated_at,
            },
        });

        edges.push({
            source: obsNodeId,
            target: topicNodeId,
            relation: "BELONGS_TO",
            reason: `Topic membership in ${rawTopic}`,
        });
    }

    // ── 4. Sessions (Optional) ───────────────────────────────────────────────
    if (includeSessions && sessions.length > 0) {
        for (const sess of sessions) {
            const sessNodeId = `session:${sess.id}`;
            const status = calculateSessionStatus(sess);
            const project = sess.project || fallbackProject;
            const projectRootId = ensureProjectRoot(project);

            nodesMap.set(sessNodeId, {
                id: sessNodeId,
                category: "SESSION",
                label: `Session ${sess.id.slice(0, 8)}`,
                status,
                metadata: {
                    project,
                    started_at: sess.started_at,
                    ended_at: sess.ended_at,
                    summary: sess.summary,
                },
            });

            edges.push({
                source: sessNodeId,
                target: projectRootId,
                relation: "BELONGS_TO",
                reason: "Work session execution",
            });
        }

        // Link observations to sessions if both nodes are in the graph
        for (const obs of includedProjectObservations) {
            if (obs.session_id) {
                const sessNodeId = `session:${obs.session_id}`;
                const obsNodeId = `obs:${obs.id}`;
                if (nodesMap.has(sessNodeId) && nodesMap.has(obsNodeId)) {
                    edges.push({
                        source: obsNodeId,
                        target: sessNodeId,
                        relation: "PRODUCED_IN",
                        reason: "Observation recorded during session",
                    });
                }
            }
        }
    }

    // ── 5. Explicit Semantic Relations ───────────────────────────────────────
    for (const rel of relations) {
        if (rel.judgment_status !== "judged") continue;

        const sourceNodeId = obsSyncIdToNodeId.get(rel.source_id);
        const targetNodeId = obsSyncIdToNodeId.get(rel.target_id);

        if (!sourceNodeId || !targetNodeId) {
            continue;
        }

        let edgeRel: GraphEdgeRelation = "RELATED_TO";
        const relType = rel.relation.toLowerCase();
        if (relType === "supersedes") {
            edgeRel = "SUPERSEDES";
        } else if (relType === "conflicts_with") {
            edgeRel = "CONFLICTS_WITH";
        }

        edges.push({
            source: sourceNodeId,
            target: targetNodeId,
            relation: edgeRel,
            reason: rel.reason || `Judged relation: ${rel.relation}`,
            metadata: {
                relation: rel.relation,
                judgment_status: rel.judgment_status,
                sync_id: rel.sync_id,
            },
        });
    }

    // ── 6. Type Registry & Slice Metadata ────────────────────────────────────
    const allIncluded = [...slicedGlobals, ...includedProjectObservations];
    const typesRegistry = buildDynamicTypeRegistry(allIncluded);

    const slice: SliceMetadata = {
        project: projectName,
        totalObservations: observations.length,
        activeCount,
        staleCount,
        globalRulesInherited: slicedGlobals.length,
        globalRulesTotal: globalObservations.length,
        topicsCount: topicNodesCreated.size,
        isExhaustive: Boolean(options.isExhaustive),
        generatedAt: referenceDate.toISOString(),
    };

    return {
        nodes: Array.from(nodesMap.values()),
        edges,
        types: typesRegistry,
        slice,
    };
}
