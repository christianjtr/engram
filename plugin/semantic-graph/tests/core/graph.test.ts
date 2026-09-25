import assert from "node:assert/strict";
import test from "node:test";
import { buildSemanticGraph } from "../../src/core/graph";
import type { EngramObservation, EngramSession } from "../../src/services/engram/types";

const mockObservations: EngramObservation[] = [
    {
        id: 1,
        sync_id: "sync-1",
        session_id: "sess-1",
        type: "architecture",
        title: "Thin Adapters",
        content: "Adapters in plugin/ must remain thin",
        project: "engram",
        scope: "project",
        topic_key: "architecture/plugins",
        revision_count: 1,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    },
    {
        id: 2,
        sync_id: "sync-2",
        session_id: "sess-1",
        type: "convention",
        title: "Commit Hygiene",
        content: "Use conventional commits",
        project: "engram",
        scope: "project",
        topic_key: "workflow",
        review_after: "2026-09-01T00:00:00Z", // Stale when evaluated at 2026-09-25
        revision_count: 1,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    },
    {
        id: 3,
        sync_id: "sync-3",
        session_id: "sess-2",
        type: "pattern",
        title: "Deleted Obs",
        content: "Should not be present",
        project: "engram",
        scope: "project",
        deleted_at: "2026-09-21T00:00:00Z",
        revision_count: 1,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    },
];

const mockGlobalObservations: EngramObservation[] = [
    {
        id: 99,
        sync_id: "sync-99",
        session_id: "sess-global",
        type: "convention",
        title: "Global Rule 1",
        content: "Strict adherence to specs",
        scope: "global",
        revision_count: 1,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    },
];

const mockSessions: EngramSession[] = [
    {
        id: "sess-1",
        project: "engram",
        directory: "/Users/test/engram",
        started_at: "2026-09-20T00:00:00Z",
        ended_at: "2026-09-20T01:00:00Z",
        summary: "Worked on plugin adapters",
    },
];

test("buildSemanticGraph validates input parameters", () => {
    assert.throws(
        () => buildSemanticGraph({ projectName: "   ", observations: [] }),
        /Graph project name must not be empty/,
    );
    assert.throws(
        () =>
            buildSemanticGraph({
                projectName: "test",
                observations: [],
                options: { referenceDate: new Date("invalid") },
            }),
        /Graph reference date must be valid/,
    );
    assert.throws(
        () =>
            buildSemanticGraph({
                projectName: "test",
                observations: [],
                options: { globalLimit: -1 },
            }),
        /Graph global limit must be a non-negative safe integer/,
    );
});

test("buildSemanticGraph builds expected graph structure for single project", () => {
    const graph = buildSemanticGraph({
        projectName: "engram",
        observations: mockObservations,
        globalObservations: mockGlobalObservations,
        options: {
            referenceDate: new Date("2026-09-25T12:00:00.000Z"),
            includeStale: false,
        },
    });

    // Node categories present
    const categories = graph.nodes.map((n) => n.category);
    assert.ok(categories.includes("GLOBAL_CONTEXT"));
    assert.ok(categories.includes("PROJECT"));
    assert.ok(categories.includes("TOPIC"));
    assert.ok(categories.includes("OBSERVATION"));

    // Stale observation (id 2) is excluded from nodes by default
    assert.equal(
        graph.nodes.some((n) => n.id === "obs:2"),
        false,
    );
    // Deleted observation (id 3) is excluded
    assert.equal(
        graph.nodes.some((n) => n.id === "obs:3"),
        false,
    );
    // Active observation (id 1) is included
    assert.equal(
        graph.nodes.some((n) => n.id === "obs:1"),
        true,
    );
    // Global observation is included
    assert.equal(
        graph.nodes.some((n) => n.id === "obs:global:99"),
        true,
    );

    // Verify slice metrics
    assert.equal(graph.slice.project, "engram");
    assert.equal(graph.slice.totalObservations, 2); // 2 non-deleted, non-global observations received
    assert.equal(graph.slice.activeCount, 1);
    assert.equal(graph.slice.staleCount, 1);
    assert.equal(graph.slice.globalRulesInherited, 1);
    assert.equal(graph.slice.globalRulesTotal, 1);
});

test("buildSemanticGraph includes stale observations when includeStale is true", () => {
    const graph = buildSemanticGraph({
        projectName: "engram",
        observations: mockObservations,
        options: {
            referenceDate: new Date("2026-09-25T12:00:00.000Z"),
            includeStale: true,
        },
    });

    assert.equal(
        graph.nodes.some((n) => n.id === "obs:2"),
        true,
    );
});

test("buildSemanticGraph in all-projects mode encodes topic ids with project tuple", () => {
    const graph = buildSemanticGraph({
        projectName: "all",
        observations: [
            {
                id: 42,
                sync_id: "sync-42",
                session_id: "sess-1",
                type: "architecture",
                title: "Thin Adapters",
                content: "Content",
                project: "engram",
                scope: "project",
                topic_key: "architecture/plugins",
                revision_count: 1,
                created_at: "2026-09-20T00:00:00Z",
                updated_at: "2026-09-20T00:00:00Z",
            },
        ],
        options: {
            all: true,
        },
    });

    const expectedTopicId = `topic:${encodeURIComponent(JSON.stringify(["engram", "architecture/plugins"]))}`;
    assert.ok(graph.nodes.some((n) => n.id === expectedTopicId));
});

test("buildSemanticGraph resolves session project when observation project is empty", () => {
    const graph = buildSemanticGraph({
        projectName: "all",
        observations: [
            {
                id: 50,
                sync_id: "sync-50",
                session_id: "sess-from-session",
                type: "architecture",
                title: "Obs without project",
                content: "Content",
                project: null,
                scope: "project",
                topic_key: "auth",
                revision_count: 1,
                created_at: "2026-09-20T00:00:00Z",
                updated_at: "2026-09-20T00:00:00Z",
            },
        ],
        sessions: [
            {
                id: "sess-from-session",
                project: "inferred-project",
                directory: "/test",
                started_at: "2026-09-20T00:00:00Z",
            },
        ],
        options: {
            all: true,
        },
    });

    const obsNode = graph.nodes.find((n) => n.id === "obs:50");
    assert.ok(obsNode && obsNode.category === "OBSERVATION");
    assert.equal(obsNode.metadata.project, "inferred-project");
    assert.ok(graph.nodes.some((n) => n.id === "project:inferred-project"));
});

test("buildSemanticGraph includes sessions and PRODUCED_IN edges when includeSessions is true", () => {
    const graph = buildSemanticGraph({
        projectName: "engram",
        observations: mockObservations,
        sessions: mockSessions,
        options: {
            includeSessions: true,
        },
    });

    assert.ok(graph.nodes.some((n) => n.id === "session:sess-1"));
    assert.ok(
        graph.edges.some(
            (e) =>
                e.source === "obs:1" &&
                e.target === "session:sess-1" &&
                e.relation === "PRODUCED_IN",
        ),
    );
});
