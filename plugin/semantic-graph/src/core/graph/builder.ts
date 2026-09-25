import type { EngramObservation, EngramRelation, EngramSession } from "../../services/engram/types";
import type {
    GraphEdge,
    GraphEdgeRelation,
    GraphNode,
    GraphNodeCategory,
    TypeMetadata,
} from "../../types";
import {
    calculateObservationLifecycle,
    isConventionLike,
    normalizeObservationType,
    normalizeTopicKey,
} from "./rules";

const GLOBAL_ROOT_ID = "global:context";

export function ensureProjectNode(
    nodesMap: Map<string, GraphNode>,
    edges: GraphEdge[],
    project: string,
): string {
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

export function buildGlobalObservationNodes(
    observations: EngramObservation[],
    globalSessionsById: Map<string, EngramSession>,
    fallbackProject: string,
    referenceDate: Date,
): { nodes: GraphNode[]; edges: GraphEdge[]; syncMap: Map<string, string> } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const syncMap = new Map<string, string>();

    for (const obs of observations) {
        const nodeId = `obs:global:${obs.id}`;
        if (obs.sync_id) syncMap.set(obs.sync_id, nodeId);

        nodes.push({
            id: nodeId,
            category: "OBSERVATION",
            label: obs.title,
            lifecycle: calculateObservationLifecycle(obs.review_after, referenceDate),
            type: normalizeObservationType(obs.type),
            scope: obs.scope,
            topic_key: normalizeTopicKey(obs.topic_key),
            content: obs.content,
            metadata: {
                project:
                    obs.project ||
                    globalSessionsById.get(obs.session_id)?.project ||
                    fallbackProject,
                sync_id: obs.sync_id,
                session_id: obs.session_id,
                created_at: obs.created_at,
            },
        });

        edges.push({
            source: nodeId,
            target: GLOBAL_ROOT_ID,
            relation: "BELONGS_TO",
            reason: "Global convention",
        });
    }

    return { nodes, edges, syncMap };
}

export function buildRelationEdges(
    relations: EngramRelation[],
    syncMap: Map<string, string>,
): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const relation of relations) {
        if (relation.judgment_status !== "judged") continue;

        const sourceId = syncMap.get(relation.source_id);
        const targetId = syncMap.get(relation.target_id);
        if (!sourceId || !targetId) continue;

        let edgeRelation: GraphEdgeRelation = "RELATED_TO";
        if (relation.relation === "supersedes") edgeRelation = "SUPERSEDES";
        if (relation.relation === "conflicts_with") edgeRelation = "CONFLICTS_WITH";

        edges.push({
            source: sourceId,
            target: targetId,
            relation: edgeRelation,
            reason: `Judged relation: ${relation.relation}`,
            metadata: {
                relation: relation.relation,
                judgment_status: relation.judgment_status,
            },
        });
    }

    return edges;
}

function nodesByCategory<C extends GraphNodeCategory>(
    nodes: GraphNode[],
    category: C,
): Extract<GraphNode, { category: C }>[] {
    return nodes.filter(
        (node): node is Extract<GraphNode, { category: C }> => node.category === category,
    );
}

export function collectTypeMetadata(nodes: GraphNode[]): Record<string, TypeMetadata> {
    const catalog: Record<string, TypeMetadata> = {};
    for (const node of nodesByCategory(nodes, "OBSERVATION")) {
        if (node.type && !catalog[node.type]) {
            catalog[node.type] = {
                type: node.type,
                label: node.type.toUpperCase(),
                isConventionLike: isConventionLike(node.type),
            };
        }
    }
    return catalog;
}
