import type {
    EngramObservation,
    EngramRelation,
    EngramSession,
    GraphBuildOptions,
    GraphEdge,
    GraphEdgeRelation,
    GraphNode,
    SemanticGraph,
    TypeMetadata
} from "../types";
import {
    isConventionLike,
    calculateObservationLifecycle,
    calculateSessionStatus,
    normalizeObservationType,
    normalizeTopicKey
} from "./rules";

export interface BuildGraphInput {
    projectName: string;
    observations: EngramObservation[];
    globalObservations?: EngramObservation[];
    globalSessions?: EngramSession[];
    sessions?: EngramSession[];
    relations?: EngramRelation[];
    options?: GraphBuildOptions;
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
        sessions = [],
        relations = [],
        options = {},
    } = input;

    const referenceDate = new Date();
    const isAllProjects = Boolean(options.all);
    const fallbackProject = isAllProjects ? "unknown-project" : projectName;
    const topicFilter = options.topicFilter ? normalizeTopicKey(options.topicFilter) : undefined;
    const typeFilter = new Set((options.typeFilter ?? []).map((type) => normalizeObservationType(type)));
    const includeStale = options.includeStale ?? false;
    const includeSessions = options.includeSessions ?? false;

    const matchesFilters = (obs: Pick<EngramObservation, "topic_key" | "type">): boolean => {
        const topic = normalizeTopicKey(obs.topic_key);
        const type = normalizeObservationType(obs.type);

        if (topicFilter && topic !== topicFilter) return false;
        if (typeFilter.size > 0 && !typeFilter.has(type)) return false;
        return true;
    };

    // Filter out deleted records upfront
    const validObservations = inputObservations.filter((obs) => obs.deleted_at == null && obs.scope !== "global");
    const validGlobals = inputGlobalObservations.filter((obs) => obs.deleted_at == null && obs.scope === "global");

    // Core Data Structures
    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const obsSyncIdToNodeId = new Map<string, string>();
    const topicNodesCreated = new Set<string>();

    // Counters for slice metadata
    let activeCount = 0;
    let staleCount = 0;

    // ── 1. Root Context ──────────────────────────────────────────────────────
    const GLOBAL_ROOT_ID = "global:context";
    nodesMap.set(GLOBAL_ROOT_ID, {
        id: GLOBAL_ROOT_ID,
        category: "GLOBAL_CONTEXT",
        label: "GLOBAL CONTEXT",
        metadata: { scope: "global" },
    });

    function ensureProjectNode(project: string): string {
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
                target: GLOBAL_ROOT_ID,
                relation: "INHERITS",
                reason: "Inherits global conventions",
            });
        }
        return id;
    }

    if (!isAllProjects) ensureProjectNode(projectName);

    // ── 2. Global Rules ──────────────────────────────────────────────────────
    const processedGlobals = validGlobals.filter((obs) => {
        if (!matchesFilters(obs)) return false;
        const lifecycle = calculateObservationLifecycle(obs.review_after, referenceDate);
        return includeStale || lifecycle === "active";
    });

    // Apply global limits
    const limit = options.globalLimit === "all" ? processedGlobals.length : (options.globalLimit ?? 15);
    const slicedGlobals = processedGlobals.slice(0, limit);

    for (const obs of slicedGlobals) {
        const nodeId = `obs:global:${obs.id}`;
        if (obs.sync_id) obsSyncIdToNodeId.set(obs.sync_id, nodeId);

        nodesMap.set(nodeId, {
            id: nodeId,
            category: "OBSERVATION",
            label: obs.title,
            lifecycle: calculateObservationLifecycle(obs.review_after, referenceDate),
            type: normalizeObservationType(obs.type),
            scope: obs.scope,
            content: obs.content,
            metadata: {
                project: obs.project || fallbackProject,
                sync_id: obs.sync_id,
                created_at: obs.created_at,
            },
        });

        edges.push({ source: nodeId, target: GLOBAL_ROOT_ID, relation: "BELONGS_TO", reason: "Global convention" });
    }

    // ── 3. Project Observations & Topics ─────────────────────────────────────
    const includedProjectObservations: EngramObservation[] = [];

    for (const obs of validObservations) {
        if (!matchesFilters(obs)) continue;

        const lifecycle = calculateObservationLifecycle(obs.review_after, referenceDate);
        if (lifecycle === "active") activeCount++;
        if (lifecycle === "stale") staleCount++;

        if (!includeStale && lifecycle === "stale") continue;

        includedProjectObservations.push(obs);

        const project = obs.project || fallbackProject;
        const projectRootId = ensureProjectNode(project);

        const rawTopic = normalizeTopicKey(obs.topic_key);
        const topicNodeId = isAllProjects
            ? `topic:${project}:${rawTopic}`
            : `topic:${rawTopic}`;

        // Create Topic Node if missing
        if (!topicNodesCreated.has(topicNodeId)) {
            topicNodesCreated.add(topicNodeId);
            nodesMap.set(topicNodeId, {
                id: topicNodeId,
                category: "TOPIC",
                label: `TOPIC: ${rawTopic}`,
                metadata: { topic: rawTopic, project },
            });
            edges.push({ source: topicNodeId, target: projectRootId, relation: "BELONGS_TO", reason: "Project topic" });
        }

        // Create Observation Node
        const obsNodeId = `obs:${obs.id}`;
        if (obs.sync_id) obsSyncIdToNodeId.set(obs.sync_id, obsNodeId);

        nodesMap.set(obsNodeId, {
            id: obsNodeId,
            category: "OBSERVATION",
            label: obs.title,
            lifecycle,
            type: normalizeObservationType(obs.type),
            scope: obs.scope,
            topic_key: rawTopic,
            content: obs.content,
            metadata: {
                project,
                sync_id: obs.sync_id,
                session_id: obs.session_id,
                created_at: obs.created_at,
            },
        });

        edges.push({ source: obsNodeId, target: topicNodeId, relation: "BELONGS_TO", reason: "Topic membership" });
    }

    // ── 4. Sessions (Optional) ───────────────────────────────────────────────
    if (includeSessions && sessions.length > 0) {
        for (const sess of sessions) {
            const sessNodeId = `session:${sess.id}`;
            const projectRootId = ensureProjectNode(sess.project || fallbackProject);

            nodesMap.set(sessNodeId, {
                id: sessNodeId,
                category: "SESSION",
                label: `Session ${sess.id.slice(0, 8)}`,
                status: calculateSessionStatus(sess),
                metadata: { project: sess.project, started_at: sess.started_at },
            });

            edges.push({ source: sessNodeId, target: projectRootId, relation: "BELONGS_TO", reason: "Work session" });
        }

        // Link observations to sessions
        for (const obs of includedProjectObservations) {
            if (obs.session_id) {
                const sessNodeId = `session:${obs.session_id}`;
                const obsNodeId = `obs:${obs.id}`;
                if (nodesMap.has(sessNodeId) && nodesMap.has(obsNodeId)) {
                    edges.push({ source: obsNodeId, target: sessNodeId, relation: "PRODUCED_IN", reason: "Recorded during session" });
                }
            }
        }
    }

    // ── 5. Semantic Relations (Conflicts) ────────────────────────────────────
    for (const rel of relations) {
        if (rel.judgment_status !== "judged") continue;

        const sourceId = obsSyncIdToNodeId.get(rel.source_id);
        const targetId = obsSyncIdToNodeId.get(rel.target_id);

        if (!sourceId || !targetId) continue;

        let edgeRel: GraphEdgeRelation = "RELATED_TO";
        if (rel.relation === "supersedes") edgeRel = "SUPERSEDES";
        if (rel.relation === "conflicts_with") edgeRel = "CONFLICTS_WITH";

        edges.push({
            source: sourceId,
            target: targetId,
            relation: edgeRel,
            reason: rel.reason || `Judged relation: ${rel.relation}`,
            metadata: {
                relation: rel.relation,
                judgment_status: rel.judgment_status,
                evidence: rel.evidence,
                confidence: rel.confidence,
            },
        });
    }

    // ── 6. Type Extraction & Return ──────────────────────────────────────────
    const uniqueTypes = new Set<string>();
    nodesMap.forEach(node => {
        if (node.category === "OBSERVATION" && node.type) uniqueTypes.add(node.type);
    });

    const typesRegistry = Array.from(uniqueTypes).reduce<Record<string, TypeMetadata>>((acc, type) => {
        acc[type] = {
            type,
            label: type.toUpperCase(),
            isConventionLike: isConventionLike(type),
        };
        return acc;
    }, {});

    return {
        nodes: Array.from(nodesMap.values()),
        edges,
        types: typesRegistry,
        slice: {
            project: projectName,
            totalObservations: validObservations.length,
            activeCount,
            staleCount,
            globalRulesInherited: slicedGlobals.length,
            globalRulesTotal: validGlobals.length,
            topicsCount: topicNodesCreated.size,
            isExhaustive: Boolean(options.isExhaustive),
            generatedAt: referenceDate.toISOString(),
        },
    };
}