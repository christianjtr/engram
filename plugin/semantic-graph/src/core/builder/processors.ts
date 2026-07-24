import type { ReasoningRole } from "../../types";
import { NODE_LEVEL_MAP } from "../../types";
import { generateMD5Hash } from "../../utils/helpers";
import { resolveReasoningRole } from "./reasoning";
import {
    type GraphBuilderContext,
    registerNode,
    registerEdge,
    ensureProjectNode,
    ensureGlobalContextNode
} from "./context";

/**
 * Processes and maps active sessions.
 */
export function processSessions(sessions: Record<string, unknown>[], ctx: GraphBuilderContext): void {
    sessions.forEach((session) => {
        if (!session.id) return;

        const sessionId = String(session.id);
        const hashId = generateMD5Hash(`session-${sessionId}`);

        ctx.sessionHashMap.set(sessionId, hashId);
        registerNode(ctx, hashId, {
            category: "SESSION",
            level: NODE_LEVEL_MAP.SESSION,
            reasoning_role: resolveReasoningRole(undefined, "SESSION", ctx.mappings),
            ...session
        });

        if (session.project) {
            const projectHash = ensureProjectNode(ctx, String(session.project));
            if (projectHash) {
                registerEdge(ctx, projectHash, hashId, `belongs:${projectHash}:${hashId}`, { type: "BELONGS_TO" });
            }
        }
    });
}

/**
 * Processes and maps active observations.
 */
export function processObservations(observations: Record<string, unknown>[], ctx: GraphBuilderContext): void {
    observations.forEach((obs) => {
        if (!obs.id) return;

        const obsKey = obs.sync_id ? String(obs.sync_id) : `obs-${obs.id}`;
        const hashId = generateMD5Hash(`observation-${obsKey}`);

        if (obs.sync_id) {
            ctx.obsSyncIdToHash.set(String(obs.sync_id), hashId);
        }

        const nodeType = obs.type ? String(obs.type) : undefined;
        const scope = String(obs.scope || "project").toLowerCase();
        const topicKey = obs.topic_key ? String(obs.topic_key) : undefined;

        registerNode(ctx, hashId, {
            category: "OBSERVATION",
            level: NODE_LEVEL_MAP.OBSERVATION,
            reasoning_role: resolveReasoningRole(nodeType, "OBSERVATION", ctx.mappings),
            ...obs
        });

        // Hierarchy connection: SESSION ➔ OBSERVATION
        if (obs.session_id) {
            const sessionHash = ctx.sessionHashMap.get(String(obs.session_id));
            if (sessionHash) {
                registerEdge(ctx, sessionHash, hashId, `occurred:${sessionHash}:${hashId}`, { type: "OCCURRED_IN" });
            }
        }

        // Routing by scope
        if (scope === "global" || scope === "personal") {
            const globalHash = ensureGlobalContextNode(ctx);
            if (globalHash) {
                registerEdge(ctx, hashId, globalHash, `global-belongs:${hashId}:${globalHash}`, { type: "BELONGS_TO" });

                if (ctx.projectName !== "all") {
                    const activeProjectHash = ensureProjectNode(ctx, ctx.projectName);
                    if (activeProjectHash) {
                        registerEdge(ctx, hashId, activeProjectHash, `inherited:${hashId}:${activeProjectHash}`, {
                            type: "CO_OCCURRENCE",
                            reason: "Global pattern inherited by current workspace"
                        });
                    }
                }
            }
        } else if (obs.project) {
            const projectHash = ensureProjectNode(ctx, String(obs.project));
            if (projectHash) {
                registerEdge(ctx, hashId, projectHash, `belongs:${hashId}:${projectHash}`, { type: "BELONGS_TO" });
            }
        }

        // Evolutionary topic clustering
        if (topicKey) {
            const topicHash = generateMD5Hash(`topic-${topicKey.toLowerCase()}`);
            registerNode(ctx, topicHash, {
                category: "OBSERVATION",
                level: NODE_LEVEL_MAP.OBSERVATION,
                reasoning_role: "FACT" as ReasoningRole,
                title: `Topic: ${topicKey}`,
                content: `Evolving decision context workspace cluster tracking updates for: ${topicKey}`
            });

            registerEdge(ctx, hashId, topicHash, `topic-link:${hashId}:${topicHash}`, {
                type: "CO_OCCURRENCE",
                reason: "Belongs to topic evolutionary line"
            });
        }
    });
}

/**
 * Processes and maps sync mutations.
 */
export function processMutations(mutations: Record<string, unknown>[], ctx: GraphBuilderContext): void {
    mutations.forEach((mut, index) => {
        const payload = mut.payload as Record<string, unknown> | undefined;
        if (!payload?.source_id || !payload?.target_id) return;

        const sourceHash = ctx.obsSyncIdToHash.get(String(payload.source_id));
        const targetHash = ctx.obsSyncIdToHash.get(String(payload.target_id));

        if (sourceHash && targetHash && ctx.seenNodes.has(sourceHash) && ctx.seenNodes.has(targetHash)) {
            const edgeName = `relation:${sourceHash}:${targetHash}:${index}`;
            registerEdge(ctx, sourceHash, targetHash, edgeName, {
                type: "CO_OCCURRENCE",
                ...payload
            });
        }
    });
}