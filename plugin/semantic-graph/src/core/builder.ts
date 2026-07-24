import fs from "fs";
import type {
    SemanticGraphConfig,
    GraphLibJson,
    GraphLibNode,
    GraphLibEdge,
    ReasoningRole,
    ReasoningRoleMappings,
} from "../types";
import { NODE_LEVEL_MAP } from "../types";
import { resolveConfig } from "../config";
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
 * Builds the native Graphlib knowledge graph matching strict GraphLibJson specifications.
 */
export function buildKnowledgeGraph(projectName: string, config?: SemanticGraphConfig): GraphLibJson {
    const activeConfig = resolveConfig(config);
    const rawData = fetchEngramData(projectName);
    const categoryExclusions = activeConfig.category_exclusions || [];
    const mappings = DEFAULT_REASONING_MAPPINGS;

    const currentProjectName = projectName;

    const nodesList: GraphLibNode[] = [];
    const edgesList: GraphLibEdge[] = [];
    const seenNodes = new Set<string>();

    const sessionHashMap = new Map<string, string>();
    const obsSyncIdToHash = new Map<string, string>();

    const registerNode = (id: string, value: Record<string, unknown>): void => {
        if (!seenNodes.has(id)) {
            seenNodes.add(id);
            nodesList.push({ v: id, value });
        }
    };

    /** Helper to register connections under the GraphLibEdge interface */
    const registerEdge = (v: string, w: string, name: string, value: Record<string, unknown>): void => {
        edgesList.push({ v, w, name, value });
    };

    /** Helper lazily mapping PROJECT nodes */
    const ensureProjectNode = (projectName: string): string | null => {
        if (categoryExclusions.includes("PROJECT")) return null;

        const projectHash = generateMD5Hash(`project-${projectName}`);
        registerNode(projectHash, {
            category: "PROJECT",
            level: NODE_LEVEL_MAP.PROJECT,
            reasoning_role: resolveReasoningRole(undefined, "PROJECT", mappings),
            name: projectName
        });
        return projectHash;
    };

    /** Helper lazily mapping GLOBAL_CONTEXT nodes */
    const ensureGlobalContextNode = (): string | null => {
        if (categoryExclusions.includes("PROJECT")) return null;

        const globalHash = generateMD5Hash("scope-global-context-root");
        registerNode(globalHash, {
            category: "PROJECT",
            level: NODE_LEVEL_MAP.PROJECT,
            reasoning_role: "FACT" as ReasoningRole,
            name: "GLOBAL_CONTEXT",
            content: "Global and personal shared cross-project conventions environment."
        });
        return globalHash;
    };

    // 🌟 PHYSICAL FILTERING: Strict isolation of local sessions
    const filteredSessions = (rawData.sessions || []).filter(
        (s: any) => currentProjectName === "all" || String(s.project).toLowerCase() === currentProjectName.toLowerCase()
    );

    // 🌟 PHYSICAL FILTERING: Avoid soft-deleted nodes and include shared scopes
    const filteredObservations = (rawData.observations || []).filter((o: any) => {
        if (o.deleted_at !== null && o.deleted_at !== undefined) return false;

        if (currentProjectName === "all") return true;

        const scope = String(o.scope || "project").toLowerCase();
        const project = String(o.project || "");

        return project.toLowerCase() === currentProjectName.toLowerCase() || scope === "global" || scope === "personal";
    });
    // Structured injection pipeline conforming to GraphLib types
    const pipeline = [
        {
            category: "SESSION",
            items: filteredSessions,
            handler: (session: Record<string, unknown>) => {
                if (!session.id) return;

                const sessionId = String(session.id);
                const hashId = generateMD5Hash(`session-${sessionId}`);

                sessionHashMap.set(sessionId, hashId);
                registerNode(hashId, {
                    category: "SESSION",
                    level: NODE_LEVEL_MAP.SESSION,
                    reasoning_role: resolveReasoningRole(undefined, "SESSION", mappings),
                    ...session
                });

                if (session.project) {
                    const projectHash = ensureProjectNode(String(session.project));
                    if (projectHash) {
                        // Hierarchical Connection: PROJECT ➔ SESSION
                        registerEdge(projectHash, hashId, `belongs:${projectHash}:${hashId}`, { type: "BELONGS_TO" });
                    }
                }
            }
        },
        {
            category: "OBSERVATION",
            items: filteredObservations,
            handler: (obs: Record<string, unknown>) => {
                if (!obs.id) return;

                const obsKey = obs.sync_id ? String(obs.sync_id) : `obs-${obs.id}`;
                const hashId = generateMD5Hash(`observation-${obsKey}`);

                if (obs.sync_id) obsSyncIdToHash.set(String(obs.sync_id), hashId);

                const nodeType = obs.type ? String(obs.type) : undefined;
                const scope = String(obs.scope || "project").toLowerCase();
                const topicKey = obs.topic_key ? String(obs.topic_key) : undefined;

                registerNode(hashId, {
                    category: "OBSERVATION",
                    level: NODE_LEVEL_MAP.OBSERVATION,
                    reasoning_role: resolveReasoningRole(nodeType, "OBSERVATION", mappings),
                    ...obs
                });

                // Ordinary Hierarchical Connection: SESSION ➔ OBSERVATION
                if (obs.session_id) {
                    const sessionHash = sessionHashMap.get(String(obs.session_id));
                    if (sessionHash) {
                        registerEdge(sessionHash, hashId, `occurred:${sessionHash}:${hashId}`, { type: "OCCURRED_IN" });
                    }
                }

                // =================================================================
                // 🌐 NATIVE SCOPE ROUTING (Based on schema)
                // =================================================================
                if (scope === "global" || scope === "personal") {
                    const globalHash = ensureGlobalContextNode();
                    if (globalHash) {
                        // Global shortcut to the center of gravity
                        registerEdge(hashId, globalHash, `global-belongs:${hashId}:${globalHash}`, { type: "BELONGS_TO" });

                        // Direct inheritance bridge with the active project
                        if (currentProjectName !== "all") {
                            const activeProjectHash = ensureProjectNode(currentProjectName);
                            if (activeProjectHash) {
                                registerEdge(hashId, activeProjectHash, `inherited:${hashId}:${activeProjectHash}`, {
                                    type: "CO_OCCURRENCE",
                                    reason: "Global pattern inherited by current workspace"
                                });
                            }
                        }
                    }
                } else if (obs.project) {
                    const projectHash = ensureProjectNode(String(obs.project));
                    if (projectHash) {
                        // Fast hierarchical shortcut approved: OBSERVATION ➔ PROJECT
                        registerEdge(hashId, projectHash, `belongs:${hashId}:${projectHash}`, { type: "BELONGS_TO" });
                    }
                }

                // =================================================================
                // 🔄 EVOLUTIONARY TOPIC CLUSTER (Managing topic_key)
                // =================================================================
                if (topicKey) {
                    const topicHash = generateMD5Hash(`topic-${topicKey.toLowerCase()}`);
                    registerNode(topicHash, {
                        category: "OBSERVATION",
                        level: NODE_LEVEL_MAP.OBSERVATION,
                        reasoning_role: "FACT" as ReasoningRole,
                        title: `Topic: ${topicKey}`,
                        content: `Evolving decision context workspace cluster tracking updates for: ${topicKey}`
                    });

                    // Connect the observation to its evolutionary decision timeline
                    registerEdge(hashId, topicHash, `topic-link:${hashId}:${topicHash}`, {
                        type: "CO_OCCURRENCE",
                        reason: "Belongs to topic evolutionary line"
                    });
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

                if (sourceHash && targetHash && seenNodes.has(sourceHash) && seenNodes.has(targetHash)) {
                    const edgeName = `relation:${sourceHash}:${targetHash}:${index}`;
                    registerEdge(sourceHash, targetHash, edgeName, {
                        type: "CO_OCCURRENCE",
                        ...payload
                    });
                }
            }
        }
    ];

    // Controlled execution of the pipeline
    for (const step of pipeline) {
        if (step.category !== "MUTATION" && categoryExclusions.includes(step.category)) {
            continue;
        }
        (step.items || []).forEach((item, index) => step.handler(item as Record<string, unknown>, index));
    }

    // 🌟 FINAL FORMATTING: Return the exact structure of the GraphLibJson interface
    return {
        options: {
            directed: true,
            multigraph: true,
            compound: false
        },
        nodes: nodesList,
        edges: edgesList
    };
}

/**
 * Saves the generated knowledge graph to disk in native Graphlib JSON format.
 */
export interface SaveGraphOptions {
    /** Whether to minify the JSON output. Defaults to true. */
    minify?: boolean;
}

export function saveKnowledgeGraph(graphJson: GraphLibJson, outputPath: string, options?: SaveGraphOptions): void {
    const { minify = true } = options || {};

    const jsonContent = minify
        ? JSON.stringify(graphJson)
        : JSON.stringify(graphJson, null, 2);

    fs.writeFileSync(outputPath, jsonContent, "utf-8");
    console.log(`Knowledge graph saved successfully using Graphlib native schema. Size: ${(jsonContent.length / 1024).toFixed(2)} KB`);
}
