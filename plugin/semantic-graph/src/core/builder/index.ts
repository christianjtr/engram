import fs from "fs";
import type { GraphLibJson, GraphLibNode, SemanticGraphConfig } from "../../types";
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
 * Builds the knowledge graph in four explicit phases:
 *   1. Filter  — narrow raw data to the target project scope
 *   2. Nodes   — create all node types (real + synthetic)
 *   3. Edges   — run each relationship pipeline independently
 *   4. Assemble — combine into the final GraphLibJson structure
 */
export function buildKnowledgeGraph(
    projectName: string | "all",
    config?: SemanticGraphConfig
): GraphLibJson {
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

    return {
        options: {
            directed: true,
            multigraph: true,
            compound: false,
        },
        nodes: allNodes,
        edges,
    };
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
