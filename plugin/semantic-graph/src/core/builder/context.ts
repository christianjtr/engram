import type { GraphLibNode, GraphLibEdge, ReasoningRole, ReasoningRoleMappings } from "../../types";
import { NODE_LEVEL_MAP } from "../../types";
import { generateMD5Hash } from "../../utils/helpers";
import { resolveReasoningRole } from "./reasoning";

/**
 * Shared state context used during the graph construction process.
 */
export interface GraphBuilderContext {
    projectName: string;
    categoryExclusions: string[];
    nodesList: GraphLibNode[];
    edgesList: GraphLibEdge[];
    seenNodes: Set<string>;
    sessionHashMap: Map<string, string>;
    obsSyncIdToHash: Map<string, string>;
    mappings: ReasoningRoleMappings;
}

/**
 * Registers a node in the graph if it has not been registered yet.
 */
export function registerNode(ctx: GraphBuilderContext, id: string, value: Record<string, unknown>): void {
    if (!ctx.seenNodes.has(id)) {
        ctx.seenNodes.add(id);
        ctx.nodesList.push({ v: id, value });
    }
}

/**
 * Registers a connection under the GraphLibEdge interface.
 */
export function registerEdge(
    ctx: GraphBuilderContext,
    v: string,
    w: string,
    name: string,
    value: Record<string, unknown>
): void {
    ctx.edgesList.push({ v, w, name, value });
}

/**
 * Lazily maps and ensures a PROJECT node exists.
 */
export function ensureProjectNode(ctx: GraphBuilderContext, projectName: string): string | null {
    if (ctx.categoryExclusions.includes("PROJECT")) return null;

    const projectHash = generateMD5Hash(`project-${projectName}`);
    registerNode(ctx, projectHash, {
        category: "PROJECT",
        level: NODE_LEVEL_MAP.PROJECT,
        reasoning_role: resolveReasoningRole(undefined, "PROJECT", ctx.mappings),
        name: projectName
    });
    return projectHash;
}

/**
 * Lazily maps and ensures the GLOBAL_CONTEXT root node exists.
 */
export function ensureGlobalContextNode(ctx: GraphBuilderContext): string | null {
    if (ctx.categoryExclusions.includes("PROJECT")) return null;

    const globalHash = generateMD5Hash("scope-global-context-root");
    registerNode(ctx, globalHash, {
        category: "PROJECT",
        level: NODE_LEVEL_MAP.PROJECT,
        reasoning_role: "FACT" as ReasoningRole,
        name: "GLOBAL_CONTEXT",
        content: "Global and personal shared cross-project conventions environment."
    });
    return globalHash;
}