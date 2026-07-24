import fs from "fs";
import { Graph, json } from "graphlib";
import type {
    SemanticGraphConfig,
    GraphLibJson,
    ReasoningRole,
    ReasoningRoleMappings
} from "../types";
import { NODE_LEVEL_MAP } from "../types";
import { SEMANTIC_GRAPH_PATH, resolveConfig } from "../config";
import { DEFAULT_REASONING_MAPPINGS } from "../config/semantics";
import { generateMD5Hash } from "../utils/helpers";
import { fetchEngramData } from "./fetcher";

/**
 * Resolves a high-level cognitive reasoning role for a node based on category and type.
 */
export function resolveReasoningRole(
    nodeType: string | undefined,
    nodeCategory: string,
    mappings?: ReasoningRoleMappings
): ReasoningRole {
    if (nodeCategory === "SESSION" || nodeCategory === "PROJECT") {
        return "HISTORICAL_RECORD";
    }

    if (!nodeType) return "FACT";

    const normalizedType = nodeType.toLowerCase().trim();
    const activeMappings = mappings || DEFAULT_REASONING_MAPPINGS;

    const constraintTypes = activeMappings?.constraint_types || [];
    const historyTypes = activeMappings?.history_types || [];

    if (constraintTypes.includes(normalizedType)) {
        return "CONSTRAINT";
    }

    if (historyTypes.includes(normalizedType)) {
        return "HISTORICAL_RECORD";
    }

    return "FACT";
}

/**
 * Builds the native Graphlib knowledge graph with embedded AI reasoning roles and category pruning.
 */
export function buildKnowledgeGraph(config?: SemanticGraphConfig): GraphLibJson {
    const activeConfig = resolveConfig(config);
    const rawData = fetchEngramData();
    const categoryExclusions = activeConfig.category_exclusions || [];
    const mappings = DEFAULT_REASONING_MAPPINGS;

    const g = new Graph({ directed: true, multigraph: true });
    const sessionHashMap = new Map<string, string>();
    const obsSyncIdToHash = new Map<string, string>();

    /** Helper to lazily ensure a PROJECT node exists in the graph */
    const ensureProjectNode = (projectName: string): string | null => {
        if (categoryExclusions.includes("PROJECT")) return null;

        const projectHash = generateMD5Hash(`project-${projectName}`);
        if (!g.hasNode(projectHash)) {
            g.setNode(projectHash, {
                category: "PROJECT",
                level: NODE_LEVEL_MAP.PROJECT,
                reasoning_role: resolveReasoningRole(undefined, "PROJECT", mappings),
                name: projectName
            });
        }
        return projectHash;
    };

    // Processing pipeline with category filtering
    const pipeline = [
        {
            category: "SESSION",
            items: rawData.sessions,
            handler: (session: Record<string, unknown>) => {
                if (!session.id) return;

                const sessionId = String(session.id);
                const hashId = generateMD5Hash(`session-${sessionId}`);

                sessionHashMap.set(sessionId, hashId);
                g.setNode(hashId, {
                    category: "SESSION",
                    level: NODE_LEVEL_MAP.SESSION,
                    reasoning_role: resolveReasoningRole(undefined, "SESSION", mappings),
                    ...session
                });

                if (session.project) {
                    const projectHash = ensureProjectNode(String(session.project));
                    if (projectHash) {
                        g.setEdge(hashId, projectHash, { type: "BELONGS_TO" }, "BELONGS_TO");
                    }
                }
            }
        },
        {
            category: "OBSERVATION",
            items: rawData.observations,
            handler: (obs: Record<string, unknown>) => {
                if (!obs.id) return;

                const obsKey = obs.sync_id ? String(obs.sync_id) : `obs-${obs.id}`;
                const hashId = generateMD5Hash(`observation-${obsKey}`);

                if (obs.sync_id) obsSyncIdToHash.set(String(obs.sync_id), hashId);

                const nodeType = obs.type ? String(obs.type) : undefined;

                g.setNode(hashId, {
                    category: "OBSERVATION",
                    level: NODE_LEVEL_MAP.OBSERVATION,
                    reasoning_role: resolveReasoningRole(nodeType, "OBSERVATION", mappings),
                    ...obs
                });

                if (obs.session_id) {
                    const sessionHash = sessionHashMap.get(String(obs.session_id));
                    if (sessionHash) {
                        g.setEdge(hashId, sessionHash, { type: "OCCURRED_IN" }, "OCCURRED_IN");
                    }
                }

                if (obs.project) {
                    const projectHash = ensureProjectNode(String(obs.project));
                    if (projectHash) {
                        g.setEdge(hashId, projectHash, { type: "BELONGS_TO" }, "BELONGS_TO");
                    }
                }
            }
        },
        {
            category: "MUTATION",
            items: rawData.mutations,
            handler: (mut: Record<string, unknown>, index: number) => {
                const payload = mut.payload as Record<string, unknown> | undefined;

                if (!payload?.source_id || !payload?.target_id) return;

                const sourceHash = obsSyncIdToHash.get(String(payload.source_id));
                const targetHash = obsSyncIdToHash.get(String(payload.target_id));

                if (sourceHash && targetHash && g.hasNode(sourceHash) && g.hasNode(targetHash)) {
                    const edgeName = `relation:${sourceHash}:${targetHash}:${index}`;
                    g.setEdge(
                        sourceHash,
                        targetHash,
                        { type: "CO_OCCURRENCE", ...payload },
                        edgeName
                    );
                }
            }
        }
    ];

    for (const step of pipeline) {
        if (step.category !== "MUTATION" && categoryExclusions.includes(step.category)) {
            continue;
        }
        (step.items || []).forEach((item, index) => step.handler(item as Record<string, unknown>, index));
    }

    return json.write(g) as GraphLibJson;
}

/**
 * Saves the generated knowledge graph to disk in native Graphlib JSON format.
 */

export interface SaveGraphOptions {
    /** Whether to minify the JSON output. Defaults to true. */
    minify?: boolean;
}

export function saveKnowledgeGraph(graphJson: GraphLibJson, outputPath: string = SEMANTIC_GRAPH_PATH, options?: SaveGraphOptions): void {
    const { minify = true } = options || {};

    const jsonContent = minify
        ? JSON.stringify(graphJson)
        : JSON.stringify(graphJson, null, 2);

    fs.writeFileSync(outputPath, jsonContent, "utf-8");
    console.log(`Knowledge graph saved successfully using Graphlib native schema. Size: ${(jsonContent.length / 1024).toFixed(2)} KB`);
}
