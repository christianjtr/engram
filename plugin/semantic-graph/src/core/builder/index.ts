import fs from "fs";
import type {
    GraphLibJson,
    GraphLibNode,
    SemanticGraphConfig,
    EnrichedGraphPayload,
    ProjectSummary,
    TimelineSession,
    TimelineObservation,
    SessionStatus,
} from "../../types";
import { resolveConfig } from "../../config";
import { DEFAULT_REASONING_MAPPINGS } from "../../config/semantics";
import { fetchEngramData } from "./fetcher";
import { filterSessionsByProject, filterObservationsByProject } from "./filters";
import {
    createSessionNode,
    createObservationNode,
    createProjectNode,
    createGlobalContextNode,
    createTopicClusterNode,
} from "./node-registry";
import {
    buildSessionProjectEdges,
    buildObservationSessionEdges,
    buildScopeRoutingEdges,
    buildProjectScopeEdges,
    buildTopicClusterEdges,
    buildMutationRelationEdges,
} from "./edge-pipelines";


export { resolveReasoningRole } from "./reasoning";

export interface SaveGraphOptions {
    /** Whether to minify the JSON output. Defaults to true. */
    minify?: boolean;
}

/**
 * Builds the knowledge graph in six explicit phases:
 *   1. Filter   — narrow raw data to the target project scope
 *   2. Nodes    — create all node types (real + synthetic)
 *   3. Edges    — run each relationship pipeline independently
 *   4. Assemble — combine into the final GraphLibJson structure
 *   5. Timeline — chronological session grouping with observations
 *   6. Summary  — pre-computed project metrics for fast agent orientation
 */
export function buildKnowledgeGraph(
    projectName: string | "all",
    config?: SemanticGraphConfig
): EnrichedGraphPayload {
    const activeConfig = resolveConfig(config);
    const mappings = activeConfig.reasoning_mappings ?? DEFAULT_REASONING_MAPPINGS;
    const categoryExclusions = activeConfig.category_exclusions ?? [];

    const rawData = fetchEngramData(projectName);

    // -------------------------------------------------------------------------
    // Phase 1: Filter raw data to the target project scope
    // -------------------------------------------------------------------------

    const filteredSessions = filterSessionsByProject(rawData.sessions, projectName);
    const filteredObservations = filterObservationsByProject(rawData.observations, projectName);

    // -------------------------------------------------------------------------
    // Phase 2: Create nodes
    // -------------------------------------------------------------------------

    // Session nodes + index (session.id -> node id) for edge resolution
    const sessionNodes: GraphLibNode[] = [];
    const sessionIdMap = new Map<string, string>(); // raw session.id → graph hash

    if (!categoryExclusions.includes("SESSION")) {
        for (const session of filteredSessions) {
            const node = createSessionNode(session, mappings);
            if (!node) continue;
            sessionNodes.push(node);
            sessionIdMap.set(String(session.id), node.v);
        }
    }

    // Observation nodes + index (obs.sync_id -> node id) for mutation edge resolution
    const observationNodes: GraphLibNode[] = [];
    const obsSyncIdMap = new Map<string, string>(); // obs.sync_id → graph hash

    if (!categoryExclusions.includes("OBSERVATION")) {
        for (const obs of filteredObservations) {
            const node = createObservationNode(obs, mappings);
            if (!node) continue;
            observationNodes.push(node);
            if (obs.sync_id) {
                obsSyncIdMap.set(String(obs.sync_id), node.v);
            }
        }
    }

    // Project nodes — one per unique project name seen across sessions + observations
    const projectNodes = new Map<string, GraphLibNode>(); // project name → node

    if (!categoryExclusions.includes("PROJECT")) {
        const projectNames = new Set<string>();
        filteredSessions.forEach((s) => { if (s.project) projectNames.add(String(s.project)); });
        filteredObservations.forEach((o) => { if (o.project) projectNames.add(String(o.project)); });

        for (const name of projectNames) {
            projectNodes.set(name, createProjectNode(name, mappings));
        }
    }

    // Global context node — single synthetic root for global/personal scope routing
    const globalContextNode =
        !categoryExclusions.includes("PROJECT") ? createGlobalContextNode() : null;

    // Topic cluster nodes — one per unique topic_key seen in observations
    const topicNodes = new Map<string, GraphLibNode>(); // topic_key → node

    for (const obs of filteredObservations) {
        if (!obs.topic_key) continue;
        const key = String(obs.topic_key);
        if (!topicNodes.has(key)) {
            topicNodes.set(key, createTopicClusterNode(key));
        }
    }

    // -------------------------------------------------------------------------
    // Phase 3: Build edges — each pipeline is independent and explicit
    // -------------------------------------------------------------------------

    const edges = [
        // Pipeline 1: SESSION -[BELONGS_TO]-> PROJECT
        ...buildSessionProjectEdges(sessionNodes, projectNodes),

        // Pipeline 2: SESSION -[OCCURRED_IN]-> OBSERVATION
        ...buildObservationSessionEdges(observationNodes, sessionIdMap),

        // Pipeline 3: OBSERVATION (global/personal) -[BELONGS_TO]-> GLOBAL_CONTEXT
        //             + -[CO_OCCURRENCE]-> PROJECT (inherited)
        ...buildScopeRoutingEdges(observationNodes, projectNodes, globalContextNode, projectName),

        // Pipeline 4: OBSERVATION (project scope) -[BELONGS_TO]-> PROJECT
        ...buildProjectScopeEdges(observationNodes, projectNodes),

        // Pipeline 5: OBSERVATION -[CO_OCCURRENCE]-> TOPIC_CLUSTER
        ...buildTopicClusterEdges(observationNodes, topicNodes),

        // Pipeline 6: OBSERVATION -[CO_OCCURRENCE]-> OBSERVATION (sync mutations)
        ...buildMutationRelationEdges(rawData.mutations, obsSyncIdMap),
    ];

    // -------------------------------------------------------------------------
    // Phase 4: Assemble final graph
    // -------------------------------------------------------------------------

    const allNodes: GraphLibNode[] = [
        ...sessionNodes,
        ...observationNodes,
        ...Array.from(projectNodes.values()),
        ...(globalContextNode ? [globalContextNode] : []),
        ...Array.from(topicNodes.values()),
    ];

    const graph: GraphLibJson = {
        options: {
            directed: true,
            multigraph: true,
            compound: false,
        },
        nodes: allNodes,
        edges,
    };

    // -------------------------------------------------------------------------
    // Phase 5: Build timeline — sessions ordered chronologically with
    //          their observations grouped underneath
    // -------------------------------------------------------------------------

    const resolveSessionStatus = (session: Record<string, unknown>): SessionStatus => {
        const endedAt = session.ended_at;
        const hasSummary = session.summary != null && session.summary !== "";
        return endedAt == null ? "active" : hasSummary ? "completed" : "interrupted";
    };

    const sortedSessions = [...filteredSessions].sort((a, b) => {
        const aTime = a.started_at ? new Date(String(a.started_at)).getTime() : 0;
        const bTime = b.started_at ? new Date(String(b.started_at)).getTime() : 0;
        return aTime - bTime;
    });

    const now = new Date();

    const timeline: TimelineSession[] = sortedSessions.map((session) => {
        const sessionId = String(session.id ?? "");
        const sessionObs = filteredObservations.filter(
            (obs) => String(obs.session_id) === sessionId
        );

        const timelineObservations: TimelineObservation[] = sessionObs.map((obs) => {
            const reviewAfter = obs.review_after;
            const is_stale = reviewAfter != null && new Date(String(reviewAfter)) < now;
            return {
                id: obs.id,
                sync_id: obs.sync_id,
                type: obs.type,
                title: obs.title,
                scope: obs.scope,
                topic_key: obs.topic_key ?? null,
                is_stale,
                created_at: obs.created_at,
            };
        });

        return {
            session_id: sessionId,
            project: String(session.project ?? ""),
            status: resolveSessionStatus(session as Record<string, unknown>),
            started_at: String(session.started_at ?? ""),
            ended_at: session.ended_at != null ? String(session.ended_at) : null,
            observation_count: timelineObservations.length,
            observations: timelineObservations,
        };
    });

    // -------------------------------------------------------------------------
    // Phase 6: Build summary — pre-computed metrics for fast agent orientation
    // -------------------------------------------------------------------------

    const activeSessions = timeline.filter((s) => s.status === "active").length;
    const completedSessions = timeline.filter((s) => s.status === "completed").length;
    const interruptedSessions = timeline.filter((s) => s.status === "interrupted").length;
    const totalObservations = filteredObservations.length;

    // Count stale observations from graph nodes to stay consistent with
    // the graphlib payload (includes observations with no session match).
    const staleObservations = observationNodes.filter(
        (n) => n.value.is_stale === true
    ).length;

    const lastSession = [...timeline]
        .reverse()
        .find((s) => s.started_at);
    const lastActivity = lastSession?.started_at ?? null;

    const summary: ProjectSummary = {
        total_sessions: timeline.length,
        active_sessions: activeSessions,
        completed_sessions: completedSessions,
        interrupted_sessions: interruptedSessions,
        total_observations: totalObservations,
        stale_observations: staleObservations,
        graph_node_count: allNodes.length,
        graph_edge_count: edges.length,
        last_activity: lastActivity,
    };

    return { summary, timeline, graph };
}

/**
 * Saves the generated knowledge graph to disk in native Graphlib JSON format.
 */
export function saveKnowledgeGraph(
    graphJson: GraphLibJson,
    outputPath: string,
    options?: SaveGraphOptions
): void {
    const { minify = true } = options ?? {};
    const jsonContent = minify
        ? JSON.stringify(graphJson)
        : JSON.stringify(graphJson, null, 2);

    fs.writeFileSync(outputPath, jsonContent, "utf-8");
    console.log(
        `Knowledge graph saved successfully using Graphlib native schema. Size: ${(jsonContent.length / 1024).toFixed(2)} KB`
    );
}
