import assert from "node:assert/strict";
import test from "node:test";
import {
    buildGlobalObservationNodes,
    buildRelationEdges,
    collectTypeMetadata,
    ensureProjectNode,
} from "../../src/core/graph/builder";
import type {
    EngramObservation,
    EngramRelation,
    EngramSession,
} from "../../src/services/engram/types";
import type { GraphEdge, GraphNode } from "../../src/types";

test("ensureProjectNode adds project node and INHERITS edge", () => {
    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    const id1 = ensureProjectNode(nodesMap, edges, "engram");
    assert.equal(id1, "project:engram");
    assert.equal(nodesMap.size, 1);
    assert.equal(edges.length, 1);
    assert.deepEqual(edges[0], {
        source: "project:engram",
        target: "global:context",
        relation: "INHERITS",
        reason: "Inherits global conventions",
    });

    // Idempotent
    const id2 = ensureProjectNode(nodesMap, edges, "engram");
    assert.equal(id2, "project:engram");
    assert.equal(nodesMap.size, 1);
    assert.equal(edges.length, 1);
});

test("buildGlobalObservationNodes builds observation nodes and BELONGS_TO edges", () => {
    const obs: EngramObservation[] = [
        {
            id: 10,
            sync_id: "sync-10",
            session_id: "sess-1",
            type: "convention",
            title: "Global Rule",
            content: "Always write tests",
            scope: "global",
            revision_count: 1,
            created_at: "2026-09-20T00:00:00Z",
            updated_at: "2026-09-20T00:00:00Z",
        },
    ];

    const sessions = new Map<string, EngramSession>();
    const result = buildGlobalObservationNodes(obs, sessions, "fallback-proj", new Date());

    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, "obs:global:10");
    assert.equal(result.nodes[0].category, "OBSERVATION");
    assert.equal(result.syncMap.get("sync-10"), "obs:global:10");
    assert.equal(result.edges.length, 1);
    assert.deepEqual(result.edges[0], {
        source: "obs:global:10",
        target: "global:context",
        relation: "BELONGS_TO",
        reason: "Global convention",
    });
});

test("buildRelationEdges connects judged relations only when both endpoints exist", () => {
    const syncMap = new Map<string, string>([
        ["sync-a", "obs:1"],
        ["sync-b", "obs:2"],
    ]);

    const relations: EngramRelation[] = [
        {
            id: 1,
            sync_id: "rel-1",
            relation: "supersedes",
            judgment_status: "judged",
            source_id: "sync-a",
            source_title: "A",
            target_id: "sync-b",
            target_title: "B",
            created_at: "2026-09-20T00:00:00Z",
            updated_at: "2026-09-20T00:00:00Z",
        },
        {
            id: 2,
            sync_id: "rel-2",
            relation: "conflicts_with",
            judgment_status: "pending", // ignored because not judged
            source_id: "sync-a",
            source_title: "A",
            target_id: "sync-b",
            target_title: "B",
            created_at: "2026-09-20T00:00:00Z",
            updated_at: "2026-09-20T00:00:00Z",
        },
        {
            id: 3,
            sync_id: "rel-3",
            relation: "related",
            judgment_status: "judged",
            source_id: "sync-a",
            source_title: "A",
            target_id: "sync-c", // missing from syncMap
            target_title: "C",
            created_at: "2026-09-20T00:00:00Z",
            updated_at: "2026-09-20T00:00:00Z",
        },
    ];

    const edges = buildRelationEdges(relations, syncMap);
    assert.equal(edges.length, 1);
    assert.deepEqual(edges[0], {
        source: "obs:1",
        target: "obs:2",
        relation: "SUPERSEDES",
        reason: "Judged relation: supersedes",
        metadata: {
            relation: "supersedes",
            judgment_status: "judged",
        },
    });
});

test("collectTypeMetadata generates metadata catalog", () => {
    const nodes: GraphNode[] = [
        {
            id: "obs:1",
            category: "OBSERVATION",
            label: "Test",
            type: "convention",
            metadata: { project: "p", sync_id: "s", created_at: "c" },
        },
        {
            id: "obs:2",
            category: "OBSERVATION",
            label: "Test 2",
            type: "bugfix",
            metadata: { project: "p", sync_id: "s2", created_at: "c" },
        },
    ];

    const types = collectTypeMetadata(nodes);
    assert.deepEqual(types, {
        convention: {
            type: "convention",
            label: "CONVENTION",
            isConventionLike: true,
        },
        bugfix: {
            type: "bugfix",
            label: "BUGFIX",
            isConventionLike: false,
        },
    });
});
